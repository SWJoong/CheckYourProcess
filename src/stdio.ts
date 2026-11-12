import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.js';
import { callLocal, ensureService } from './runtime.js';

// All hosts use the same authenticated local writer, even when each starts its own stdio process.
let service: ReturnType<typeof ensureService> | undefined;
const server = createMcpServer(async (action, args) => {
  // Discovery must answer even when the local writer cannot start.
  service ??= ensureService();
  try { return await callLocal(await service, action, args); }
  catch (error) { service = undefined; throw error; }
}, undefined, { card: process.env.CYP_CARD !== 'off' });
await server.connect(new StdioServerTransport());
