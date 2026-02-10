import { parseLogLevelEnvVar } from './log-filters.js';

describe('parseEnv', () => {
  const defaultLevel = 'info';

  it('returns default level and empty filters when env is empty', () => {
    const env = '';
    const [level, filters] = parseLogLevelEnvVar(env, defaultLevel);
    expect(level).toBe(defaultLevel);
    expect(filters).toEqual([]);
  });

  it('parses level and filters from env string', () => {
    const env = 'debug;warn:module1,module2;error:module3';
    const [level, filters] = parseLogLevelEnvVar(env, defaultLevel);
    expect(level).toBe('debug');
    expect(filters).toEqual([
      ['module3', 'error'],
      ['module2', 'warn'],
      ['module1', 'warn'],
    ]);
  });

  it('handles spaces in env string', () => {
    const env = 'debug; warn: module1, module2; error: module3';
    const [level, filters] = parseLogLevelEnvVar(env, defaultLevel);
    expect(level).toBe('debug');
    expect(filters).toEqual([
      ['module3', 'error'],
      ['module2', 'warn'],
      ['module1', 'warn'],
    ]);
  });

  it('throws an error for invalid default log level', () => {
    const env = 'invalid;module1:warn';
    expect(() => parseLogLevelEnvVar(env, defaultLevel)).toThrow('Invalid log level: invalid');
  });

  it('throws an error for invalid log level in filter', () => {
    const env = 'invalid;warn:module';
    expect(() => parseLogLevelEnvVar(env, defaultLevel)).toThrow('Invalid log level: invalid');
  });

  it('throws an error for invalid log filter statement', () => {
    const defaultLevel = 'info';
    const env = 'debug;warn:module1;error:';
    expect(() => parseLogLevelEnvVar(env, defaultLevel)).toThrow('Invalid log filter statement: error');
  });
});
