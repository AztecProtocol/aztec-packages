import { type LogLevel, LogLevels } from './log-levels.js';

export type LogFilters = [string, LogLevel][];

export function getLogLevelFromFilters(filters: LogFilters, module: string): LogLevel | undefined {
  for (const [filterModule, level] of filters) {
    try {
      const regex = new RegExp(filterModule);
      if (regex.test(module)) {
        return level as LogLevel;
      }
    } catch {
      // If regex is invalid, fall back to startsWith check
      if (module.startsWith(filterModule)) {
        return level as LogLevel;
      }
    }
  }
  return undefined;
}

/**
 * Parses the LOG_LEVEL env string into a default level and per-module filter overrides.
 *
 * Format: `<default_level>;<level>:<module1>,<module2>;<level>:<module3>;...`
 * - First segment (before the first `;`) is the default log level for all modules.
 * - Remaining segments are `level:module` pairs: apply the given level to the listed modules (comma-separated).
 * - Later filters override earlier ones for overlapping module matches.
 * - The `aztec:` prefix is stripped from module names; spaces are trimmed.
 *
 * @example
 * ```ts
 * parseLogLevel('debug;warn:module1,module2;error:module3', 'info')
 * // => ['debug', [['module3', 'error'], ['module2', 'warn'], ['module1', 'warn']]]
 * ```
 */
export function parseLogLevelEnvVar(
  logLevelEnvVar: string | undefined,
  defaultLevel: LogLevel,
): [LogLevel, LogFilters] {
  if (!logLevelEnvVar) {
    return [defaultLevel, []];
  }
  const [level] = logLevelEnvVar.split(';', 1);
  assertValidLogLevel(level);
  return [level, parseFilters(logLevelEnvVar.slice(level.length + 1))];
}

function assertValidLogLevel(level: string): asserts level is LogLevel {
  if (!LogLevels.includes(level as LogLevel)) {
    throw new Error(`Invalid log level: ${level}`);
  }
}

function parseFilters(definition: string | undefined): LogFilters {
  if (!definition) {
    return [];
  }

  const statements = definition.split(';');
  const filters: LogFilters = [];
  for (const statement of statements) {
    const [level] = statement.split(':', 1);
    const modules = statement.slice(level.length + 1);
    if (!modules || !level) {
      throw new Error(`Invalid log filter statement: ${statement}`);
    }
    const sanitizedLevel = level.trim().toLowerCase();
    assertValidLogLevel(sanitizedLevel);
    for (const module of modules.split(',')) {
      filters.push([
        module
          .trim()
          .toLowerCase()
          .replace(/^aztec:/, ''),
        sanitizedLevel as LogLevel | 'silent',
      ]);
    }
  }
  return filters.reverse();
}
