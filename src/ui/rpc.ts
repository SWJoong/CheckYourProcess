export class RequestError extends Error {
  constructor(readonly code: string, message?: string) { super(message ?? code); }
}

export function bridgeError(error: unknown): RequestError {
  const message = (error as { message?: unknown })?.message;
  return new RequestError(typeof message === 'string' && /IPC not available for MCP tool call/i.test(message)
    ? 'HOST_TOOL_UNAVAILABLE' : 'CONNECTION_FAILED');
}

export function toolPayload(result: {
  structuredContent?: unknown; content?: { type: string; text?: string }[]; isError?: boolean;
}): Record<string, unknown> {
  let value = result.structuredContent;
  if (value === undefined) {
    try { value = JSON.parse(result.content?.find(item => item.type === 'text')?.text ?? ''); }
    catch { /* Preserve uncertain writes if a host omits or corrupts the result. */ }
  }
  const payload = value as { error?: { code?: unknown } } | null;
  if (payload?.error) throw new RequestError(typeof payload.error.code === 'string' ? payload.error.code : 'REQUEST_FAILED');
  if (result.isError) throw new RequestError('REQUEST_FAILED');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('CONNECTION_FAILED');
  return value as Record<string, unknown>;
}
