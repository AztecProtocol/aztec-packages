/**
 * Type for logging functions that accept any number of arguments.
 */
export type Logger = (...args: any[]) => void;

/**
 * ConsoleLogger is a utility class for formatting and logging messages with a specified prefix.
 * It provides a simple interface for directing log messages to a custom logger function (defaults to console.log).
 * The 'log' method allows logging of multiple arguments while prepending the configured prefix to the log message.
 */
class ConsoleLogger {
  constructor(private prefix: string, private logger: (...args: any[]) => void = console.log) {}

  /**
 * Logs a message with a prefixed string to the console.
 * The log function takes any number of arguments that are passed to the logger function.
 * The prefixed string is set during object instantiation and helps in differentiating the logs.
 *
 * @param args - Any number of arguments to be logged in the console.
 */
public log(...args: any[]) {
    this.logger(`${this.prefix}:`, ...args);
  }
}

/**
 * Create a Logger instance with an optional prefix string.
 * If a prefix is provided, the logger will output messages with the format "prefix: message".
 * Otherwise, it will use the default 'console.log' as the logger function.
 *
 * @param prefix - The optional string to prepend to log messages.
 * @returns A Logger instance with the specified prefix.
 */
export function createLogger(prefix: string): Logger {
  if (prefix) {
    const logger = new ConsoleLogger(prefix, console.log);
    return (...args: any[]) => logger.log(...args);
  }
  return console.log;
}
