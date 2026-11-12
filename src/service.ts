import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { TrackerStore } from './store.js';
import { ACTION_SCHEMAS, createMcpServer, errorPayload } from './mcp.js';
import { dataDir, getOrCreateToken, SERVICE_ID, VERSION, type RuntimeInfo } from './runtime.js';

const hookSchema = z.object({
  host: z.enum(['claude-code', 'codex']), hostSessionId: z.string().min(1).max(200),
  event: z.enum(['prompt', 'tool-start', 'tool-end', 'permission', 'stop', 'interrupt', 'session-end', 'error', 'subagent-start', 'subagent-stop']),
  eventId: z.string().min(1).max(200), toolUseId: z.string().min(1).max(200).optional(),
  agentId: z.string().min(1).max(200).optional(),
  asyncAgentId: z.string().min(1).max(200).optional(), handback: z.boolean().optional(),
  planItems: z.array(z.object({ content: z.string().trim().min(1).max(500), status: z.enum(['pending', 'in_progress', 'completed']) }).strict()).max(100).optional(),
}).strict();
const bindingSchema = hookSchema.pick({ host: true, hostSessionId: true });
const envelopeSchema = z.object({ action: z.string(), args: z.record(z.string(), z.unknown()).default({}) }).strict();

export interface ServiceOptions { dataDir?: string; port?: number; htmlPath?: string }
export interface RunningService { runtime: RuntimeInfo; close(): Promise<void> }

export async function startService(options: ServiceOptions = {}): Promise<RunningService> {
  const directory = resolve(options.dataDir || dataDir());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const token = await getOrCreateToken(directory);
  const store = new TrackerStore(join(directory, 'progress.sqlite'));
  const htmlPath = options.htmlPath || fileURLToPath(new URL('./progress.html', import.meta.url));
  const tickets = new Map<string, number>();
  const previewSessions = new Map<string, number>();
  let actualPort = options.port ?? Number(process.env.CYP_PORT || 49173);
  let stopping: Promise<void> | undefined;

  function execute(action: string, args: Record<string, unknown>) {
    if (action === 'poll_progress') action = 'get_snapshot';
    if (action === 'show_progress') { action = args.trackingSessionId ? 'get_snapshot' : 'get_catalog'; if (action === 'get_catalog') args = {}; }
    if (action === 'get_binding') return store.execute(action, bindingSchema.parse(args));
    const schema = Object.hasOwn(ACTION_SCHEMAS, action) ? ACTION_SCHEMAS[action as keyof typeof ACTION_SCHEMAS] : undefined;
    if (!schema) throw Object.assign(new Error('Unknown action.'), { code: 'UNKNOWN_ACTION' });
    const parsed = schema.parse(args) as Record<string, unknown>;
    return store.execute(action, action === 'report_state' ? { ...parsed, source: 'reported' } : parsed);
  }
  function bearer(req: IncomingMessage) {
    const given = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    return equalSecret(given, token);
  }
  function previewAuth(req: IncomingMessage) {
    const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('cyp_preview='))?.slice('cyp_preview='.length);
    if (!cookie) return false;
    const expiry = previewSessions.get(cookie);
    if (!expiry || expiry <= Date.now()) { previewSessions.delete(cookie); return false; }
    return true;
  }
  function validateOrigin(req: IncomingMessage) {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return false;
    if (!req.headers.origin) return true;
    return req.headers.origin === `http://127.0.0.1:${actualPort}` || req.headers.origin === `http://localhost:${actualPort}`;
  }

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!validateOrigin(req)) { json(res, 403, { error: { code: 'FORBIDDEN_ORIGIN', message: 'Only the local application origin is accepted.' } }); return; }
      const url = new URL(req.url || '/', `http://127.0.0.1:${actualPort}`);
      if (url.pathname === '/preview' && req.method === 'GET' && url.searchParams.has('ticket')) {
        const ticket = url.searchParams.get('ticket')!;
        const expiry = tickets.get(ticket);
        tickets.delete(ticket);
        if (!expiry || expiry <= Date.now()) { json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Preview link expired. Run the preview command again.' } }); return; }
        const cookie = randomBytes(32).toString('hex');
        previewSessions.set(cookie, Date.now() + 8 * 60 * 60 * 1000);
        res.writeHead(303, { Location: '/preview', 'Set-Cookie': `cyp_preview=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
        res.end(); return;
      }
      const withBearer = bearer(req);
      const withPreview = (url.pathname === '/preview' || url.pathname === '/api/action') && previewAuth(req);
      if (!withBearer && !withPreview) { json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Local authentication is required.' } }); return; }

      if (url.pathname === '/health' && req.method === 'GET') {
        json(res, 200, { service: SERVICE_ID, version: VERSION, pid: process.pid }); return;
      }
      if (url.pathname === '/api/preview-ticket' && req.method === 'POST' && withBearer) {
        const ticket = randomBytes(24).toString('hex');
        for (const [key, expiry] of tickets) if (expiry <= Date.now()) tickets.delete(key);
        tickets.set(ticket, Date.now() + 60000);
        json(res, 200, { url: `http://127.0.0.1:${actualPort}/preview?ticket=${ticket}`, expiresIn: 60 }); return;
      }
      if (url.pathname === '/preview' && req.method === 'GET') {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(await readFile(htmlPath, 'utf8')); return;
      }
      if (url.pathname === '/api/action' && req.method === 'POST') {
        const body = envelopeSchema.parse(await readJson(req));
        json(res, 200, { result: execute(body.action, body.args) }); return;
      }
      if (url.pathname === '/api/hook' && req.method === 'POST' && withBearer) {
        json(res, 200, { result: store.handleHook(hookSchema.parse(await readJson(req))) }); return;
      }
      if (url.pathname === '/api/shutdown' && req.method === 'POST' && withBearer) {
        json(res, 200, { stopped: true });
        setImmediate(() => { void close(); }); return;
      }
      if (url.pathname === '/mcp' && req.method === 'POST' && withBearer) {
        const body = await readJson(req);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        const mcp = createMcpServer(execute, htmlPath);
        await mcp.connect(transport);
        res.on('close', () => { void transport.close(); void mcp.close(); });
        await transport.handleRequest(req, res, body); return;
      }
      if (url.pathname === '/mcp') { res.setHeader('Allow', 'POST'); json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use MCP Streamable HTTP POST requests.' } }); return; }
      json(res, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      const payload = errorPayload(error);
      json(res, payload.code === 'CONFLICT' ? 409 : payload.code === 'INTERNAL_ERROR' ? 500 : 400, { error: payload });
    }
  });

  function close(): Promise<void> {
    if (!stopping) stopping = new Promise<void>((resolveClose, reject) => {
      server.close(error => {
        store.close();
        if (error) reject(error); else resolveClose();
      });
      server.closeIdleConnections();
    });
    return stopping;
  }

  try {
    await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(actualPort, '127.0.0.1', resolveListen); });
    actualPort = (server.address() as { port: number }).port;
    const runtime: RuntimeInfo = { port: actualPort, token, pid: process.pid, version: VERSION, url: `http://127.0.0.1:${actualPort}` };
    const temporary = join(directory, `runtime.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
    await writeFile(temporary, JSON.stringify(runtime), { mode: 0o600 });
    await rename(temporary, join(directory, 'runtime.json'));
    return { runtime, close };
  } catch (error) {
    server.close(); store.close(); throw error;
  }
}

function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Use application/json.'), { code: 'INVALID_INPUT' });
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > 512 * 1024) throw Object.assign(new Error('Request is too large.'), { code: 'INVALID_INPUT' });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { code: 'INVALID_INPUT' }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startService().then(service => {
    const stop = () => { void service.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') process.stderr.write('CheckYourProcess service could not start. Check the runtime and local data directory.\n');
    process.exitCode = 1;
  });
}
