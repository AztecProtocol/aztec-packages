/**
 * Create a logger function with a specific name prefix.
 * @param name - The name to prefix log messages with
 * @returns A logger function
 */
export function createDebugLogger(name: string): (msg: string) => void {
  return (msg: string) => {
    console.log(`[${name}] ${msg}`);
  };
}
