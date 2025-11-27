/**
 * Create a logger function with a specific name prefix.
 * Outputs to stderr to avoid interfering with stdout-based command pipelines.
 * @param name - The name to prefix log messages with
 * @returns A logger function
 */
export function createDebugLogger(name: string): (msg: string) => void {
  return (msg: string) => {
    // Use console.error to write to stderr, not stdout
    // This prevents logger output from interfering with command output parsing
    console.error(`[${name}] ${msg}`);
  };
}
