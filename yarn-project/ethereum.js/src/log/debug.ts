import debug from 'debug';

let preLogHook: ((...args: any[]) => void) | undefined;
let postLogHook: ((...args: any[]) => void) | undefined;

/**
 * The function that serves as a central hub through which all logs pass.
 * It first checks if the log is enabled for the given logger's namespace,
 * then calls the preLogHook (if any) with the logger's namespace and the provided arguments,
 * followed by the actual logger function, and finally calls the postLogHook (if any) with the
 * logger's namespace and the provided arguments.
 *
 * @param logger - The debug logger instance associated with a specific namespace.
 * @param args - The arguments to be passed to the logger and hooks.
 */
function theFunctionThroughWhichAllLogsPass(logger: any, ...args: any[]) {
  if (!debug.enabled(logger.namespace)) {
    return;
  }
  if (preLogHook) {
    preLogHook(logger.namespace, ...args);
  }
  logger(...args);
  if (postLogHook) {
    postLogHook(logger.namespace, ...args);
  }
}

/**
 * Creates a debug logger with the specified namespace.
 * The returned logger function will only log messages if its namespace is enabled.
 * Additionally, it passes the log messages through pre and post log hooks if they are set.
 *
 * @param name - The namespace for the debug logger.
 * @returns A debug logger function with the given namespace.
 */
export function createDebugLogger(name: string): any {
  const logger = debug(name);
  return (...args: any[]) => theFunctionThroughWhichAllLogsPass(logger, ...args);
}

/**
 * Set a hook function to be called before each log output by the debug logger.
 * The provided function will be invoked with the logger namespace and log arguments.
 * This can be useful for additional processing or filtering of logs before they are output.
 *
 * @param fn - The function to be called before logging. Receives the logger namespace and log arguments as parameters.
 */
export function setPreDebugLogHook(fn: (...args: any[]) => void) {
  preLogHook = fn;
}

/**
 * Sets a post-debug log hook function that will be called after each log message.
 * The function provided should accept any number of arguments, with the first argument being the logger's namespace,
 * followed by the original log message arguments. This hook can be used to perform additional actions such as
 * formatting, filtering or redirecting log messages.
 *
 * @param fn - The function to be called after each log message.
 */
export function setPostDebugLogHook(fn: (...args: any[]) => void) {
  postLogHook = fn;
}

/**
 * Enable debug logs for specified namespaces.
 * The input 'str' should be a comma-separated list of namespaces to enable logs.
 * Wildcards (*) can be used to enable logs for multiple namespaces at once.
 * For example, 'foo*,bar*' will enable logs for all namespaces starting with foo and bar.
 *
 * @param str - The string containing comma-separated namespaces or wildcard patterns.
 */
export function enableLogs(str: string) {
  debug.enable(str);
}

/**
 * Checks whether logs for the specified namespace are enabled.
 * The input 'str' should be a string representing the namespace,
 * as defined during the creation of the debug logger.
 *
 * @param str - The namespace string to check if logs are enabled.
 * @returns A boolean indicating whether logs are enabled for the specified namespace.
 */
export function isLogEnabled(str: string) {
  return debug.enabled(str);
}
