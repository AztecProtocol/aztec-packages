// Get log level from environment without triggering bundler polyfills
function getLogLevel(): string | undefined {
  try {
    // Use globalThis to avoid bundler process polyfills
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    return g.process?.env?.LOG_LEVEL;
  } catch {
    return undefined;
  }
}

/**
 * Create a debug logger function.
 * Only outputs when LOG_LEVEL=debug, otherwise returns a no-op.
 * Users can also provide their own logger via BackendOptions.logger.
 * @param name - The name to prefix log messages with
 * @returns A logger function (no-op unless LOG_LEVEL=debug)
 */
export function createDebugLogger(name: string): (msg: string) => void {
  if (getLogLevel() === 'debug') {
    return (msg: string) => {
      console.debug(`[${name}] ${msg}`);
    };
  }
  return () => {};
}
