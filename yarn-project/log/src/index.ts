export type DebugLogger = (...args: any[]) => void;
export function createDebugLogger(moduleName: string): DebugLogger {
  // TODO port aztec2 logger over
  return (...args: any[]) => console.log(moduleName, ...args);
}
