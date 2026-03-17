/**
 * Named command dispatcher.
 * Decouples UI events from business logic — commands are registered in main.ts.
 */

export type CommandFn = (payload?: unknown) => void | Promise<void>;

const registry = new Map<string, CommandFn>();

export function register(name: string, fn: CommandFn): void {
  registry.set(name, fn);
}

export function dispatch(name: string, payload?: unknown): void | Promise<void> {
  const fn = registry.get(name);
  if (fn) return fn(payload);
}
