type Args = Record<string, unknown>;
type Send = (action: string, args: Args) => Promise<unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

const definitiveErrors = new Set([
  'INVALID_INPUT', 'NOT_FOUND', 'CONFLICT', 'PROJECT_MISMATCH', 'PROJECT_CHANGE',
  'SESSION_ENDED', 'UNKNOWN_ACTION', 'UNAUTHORIZED', 'FORBIDDEN', 'MUTATION_REUSED',
]);

/** A lost response can follow a committed write; retry the same intent with its original ID. */
export class RetryingMutations {
  private readonly pending = new Map<string, string>();
  constructor(private readonly send: Send, private readonly createId: () => string = () => crypto.randomUUID()) {}

  async perform(action: string, args: Args): Promise<unknown> {
    const key = JSON.stringify([action, canonical(args)]);
    const mutationId = this.pending.get(key) ?? this.createId();
    this.pending.set(key, mutationId);
    try {
      const result = await this.send(action, { ...args, mutationId });
      this.pending.delete(key);
      return result;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code && definitiveErrors.has(code)) this.pending.delete(key);
      throw error;
    }
  }
}
