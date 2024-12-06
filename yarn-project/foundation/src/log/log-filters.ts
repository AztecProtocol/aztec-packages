import { type LogLevel, LogLevels } from './log-levels.js';

export type LogFilters = [string, LogLevel][];

export function getLogLevelFromFilters(filters: LogFilters, module: string): LogLevel | undefined {
  for (const [filterModule, level] of filters) {
    if (module.startsWith(filterModule)) {
      return level as LogLevel;
    }
  }
  return undefined;
}

export function assertLogLevel(level: string): asserts level is LogLevel {
  if (!LogLevels.includes(level as LogLevel)) {
    throw new Error(`Invalid log level: ${level}`);
  }
}

export function parseEnv(env: string | undefined, defaultLevel: LogLevel): [LogLevel, LogFilters] {
  if (!env) {
    return [defaultLevel, []];
  }
  const [level] = env.split(';', 1);
  assertLogLevel(level);
  return [level, parseFilters(env.slice(level.length + 1))];
}

export function parseFilters(definition: string | undefined): LogFilters {
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
    assertLogLevel(sanitizedLevel);
    for (const module of modules.split(',')) {
      filters.push([module.trim().toLowerCase(), sanitizedLevel as LogLevel | 'silent']);
    }
  }
  return filters.reverse();
}
