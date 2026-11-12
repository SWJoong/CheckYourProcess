import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.1.0-beta.5';
export const SERVICE_ID = 'checkyourprocess';
export interface RuntimeInfo { port: number; token: string; pid: number; version: string; url: string }
export interface RuntimeOptions { dataDir?: string; port?: number }

export function dataDir(): string {
  return resolve(process.env.CYP_DATA_DIR || join(process.env.USERPROFILE || homedir(), '.checkyourprocess'));
}

export async function readRuntime(options: RuntimeOptions = {}): Promise<RuntimeInfo | null> {
  try {
    const value = JSON.parse(await readFile(join(options.dataDir || dataDir(), 'runtime.json'), 'utf8'));
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || typeof value.token !== 'string' || !Number.isInteger(value.pid)) return null;
    return { ...value, url: `http://127.0.0.1:${value.port}` };
  } catch { return null; }
}

export async function getOrCreateToken(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'token');
  try { await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  // A second launcher may observe the exclusive-created file before its first write completes.
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = (await readFile(path, 'utf8')).trim();
    if (/^[a-f0-9]{64}$/.test(token)) return token;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Invalid local authentication file. Restore or remove the token file while the service is stopped.');
}

// Why the service recorded in runtime.json cannot be used; null means it is healthy.
export async function healthProblem(runtime: RuntimeInfo): Promise<string | null> {
  try {
    const response = await fetch(`${runtime.url}/health`, {
      headers: { Authorization: `Bearer ${runtime.token}` }, signal: AbortSignal.timeout(1000),
    });
    if (!response.ok) return `${runtime.url}/health answered HTTP ${response.status}`;
    const body = await response.json() as { service?: string; pid?: number; version?: string };
    if (body.service !== SERVICE_ID) return `${runtime.url} is not a CheckYourProcess service`;
    if (body.pid !== runtime.pid) return `runtime.json says pid ${runtime.pid} but the listener is pid ${body.pid}`;
    if (body.version !== VERSION) return `the running service is version ${body.version} but this plugin is ${VERSION}; stop the old service`;
    return null;
  } catch { return `${runtime.url}/health is unreachable, timed out after 1s, or sent an invalid reply`; }
}

export async function isHealthy(runtime: RuntimeInfo): Promise<boolean> {
  return await healthProblem(runtime) === null;
}

export async function ensureService(options: RuntimeOptions = {}): Promise<RuntimeInfo> {
  const directory = resolve(options.dataDir || dataDir());
  if (!options.dataDir && !process.env.CYP_DATA_DIR && process.env.LOCALAPPDATA) {
    const legacy = join(process.env.LOCALAPPDATA, 'CheckYourProcess');
    try {
      await access(join(legacy, 'progress.sqlite'));
      process.stderr.write(`CheckYourProcess: Earlier data remains at ${legacy}. It was not migrated or merged. New data directory: ${directory}. See docs/upgrade-beta2.md.\n`);
    } catch { /* No readable legacy database in this host's AppData view. */ }
  }
  const noRuntime = 'runtime.json is missing or unreadable, so no running service was found';
  const existing = await readRuntime({ dataDir: directory });
  let problem = existing ? await healthProblem(existing) : noRuntime;
  if (existing && !problem) return existing;
  const token = await getOrCreateToken(directory);
  const port = options.port ?? Number(process.env.CYP_PORT || existing?.port || 49173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CYP_PORT must be an integer from 1 to 65535.');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./service.js', import.meta.url))], {
    env: { ...process.env, CYP_DATA_DIR: directory, CYP_PORT: String(port) },
    windowsHide: true, detached: true, stdio: 'ignore',
  });
  let launchError: Error | undefined;
  child.on('error', error => { launchError = error; });
  child.unref();
  for (let attempt = 0; attempt < 80; attempt++) {
    if (launchError) throw launchError;
    const current = await readRuntime({ dataDir: directory });
    problem = current ? await healthProblem(current) : noRuntime;
    if (current && !problem) return current;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Could not start CheckYourProcess on loopback port ${port} with data directory ${directory}. Last check: ${problem}. An existing listener was left untouched. If a service is already running, it uses another data directory or version: compare CYP_DATA_DIR, CYP_PORT and USERPROFILE with the host that started it.`);
}

export async function callLocal(runtime: RuntimeInfo, action: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch(`${runtime.url}/api/action`, {
    method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, args }), signal: AbortSignal.timeout(10000),
  });
  const body = await response.json() as { result?: unknown; error?: { code: string; message: string; details?: unknown } };
  if (!response.ok || body.error) throw Object.assign(new Error(body.error?.message || 'Local service request failed.'), body.error);
  return body.result;
}
