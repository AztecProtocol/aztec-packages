import { build as buildPrettyStream } from 'pino-pretty';
import { Writable } from 'stream';

import {
  createLogger,
  getActorColor,
  logger,
  overwriteLoggingStream,
  pinoPrettyOpts,
  registerLoggingStream,
  resetActorColors,
} from './pino-logger.js';

/** Set LOG_TEST_LOGS=1 to print captured log output to console when running tests. */
const LOG_TEST_LOGS = process.env.LOG_TEST_LOGS === '1';

/**
 * A writable stream that captures output to an array of strings.
 * Used for testing logger output without intercepting stderr.
 */
class CapturingStream extends Writable {
  public lines: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    this.lines.push(chunk.toString());
    callback();
  }

  /** Clears the captured lines. */
  clear(): void {
    this.lines = [];
  }

  /** Returns all captured lines as parsed JSON objects. */
  getJsonLines(): unknown[] {
    return this.lines.map(line => JSON.parse(line));
  }
}

describe('pino-logger', () => {
  let capturingStream: CapturingStream;
  let originalLevel: string;

  beforeAll(() => {
    // Store original level and set to trace to capture all logs
    originalLevel = logger.level;
    logger.level = 'trace';
  });

  afterAll(() => {
    // Restore original level
    logger.level = originalLevel;
  });

  beforeEach(() => {
    capturingStream = new CapturingStream();
    registerLoggingStream(capturingStream);
  });

  it('logs messages with the correct module and level', () => {
    const testLogger = createLogger('test-module');

    // Force the logger to log at info level
    testLogger.info('Hello world', { foo: 'bar' });

    // Check that we captured the log
    expect(capturingStream.lines.length).toBeGreaterThan(0);

    const logEntry = JSON.parse(capturingStream.lines[capturingStream.lines.length - 1]);
    expect(logEntry.module).toBe('test-module');
    expect(logEntry.msg).toBe('Hello world');
    expect(logEntry.foo).toBe('bar');
    expect(logEntry.level).toBe(30); // info level
  });

  it('supports pino-style format strings with %s substitution', () => {
    const testLogger = createLogger('format-test');
    capturingStream.clear();

    testLogger.info('Hello %s', 'world');

    const entries = capturingStream.getJsonLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      module: 'format-test',
      msg: 'Hello world',
    });
  });

  it('supports multiple format arguments', () => {
    const testLogger = createLogger('multi-format-test');
    capturingStream.clear();

    testLogger.info('User %s logged in from %s', 'alice', '192.168.1.1');

    const entries = capturingStream.getJsonLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      module: 'multi-format-test',
      msg: 'User alice logged in from 192.168.1.1',
    });
  });

  it('supports format strings with data object', () => {
    const testLogger = createLogger('format-data-test');
    capturingStream.clear();

    testLogger.info('Processing block %s', 42, { txCount: 10 });

    const entries = capturingStream.getJsonLines() as any[];
    expect(entries).toHaveLength(1);
    expect(entries[0].module).toBe('format-data-test');
    expect(entries[0].msg).toBe('Processing block 42');
    expect(entries[0].txCount).toBe(10);
  });

  it('handles format strings at different log levels', () => {
    const testLogger = createLogger('level-format-test');
    capturingStream.clear();

    testLogger.debug('Debug %s', 'message');
    testLogger.verbose('Verbose %s', 'message');
    testLogger.trace('Trace %s', 'message');
    testLogger.warn('Warn %s', 'message');

    const entries = capturingStream.getJsonLines() as any[];
    expect(entries).toHaveLength(4);
    expect(entries.map(e => e.msg)).toEqual([
      'Debug message',
      'Verbose message',
      'Trace message',
      'Warn message',
    ]);
  });

  it('logs at different levels', () => {
    const testLogger = createLogger('level-test');
    capturingStream.clear();

    testLogger.warn('A warning message');
    testLogger.error('An error message');

    const entries = capturingStream.getJsonLines();
    expect(entries).toHaveLength(2);

    expect(entries[0]).toMatchObject({
      module: 'level-test',
      msg: 'A warning message',
      level: 40, // warn
    });

    expect(entries[1]).toMatchObject({
      module: 'level-test',
      msg: 'An error message',
      level: 50, // error
    });
  });

  it('can use overwriteLoggingStream for isolated capture', () => {
    // overwriteLoggingStream replaces the stream entirely (no accumulation)
    const isolatedStream = new CapturingStream();
    overwriteLoggingStream(isolatedStream);

    const testLogger = createLogger('isolated-test');
    testLogger.info('Isolated message');

    expect(isolatedStream.lines).toHaveLength(1);
    expect(JSON.parse(isolatedStream.lines[0])).toMatchObject({
      module: 'isolated-test',
      msg: 'Isolated message',
    });
  });

  it('generates pretty output when using pino-pretty', () => {
    const capturedOutput = new CapturingStream();

    // Create a pino-pretty stream that writes to our capturing stream
    // Use colors only when debugging so we can see them in console
    const prettyStream = buildPrettyStream({
      ...pinoPrettyOpts,
      destination: capturedOutput,
      colorize: LOG_TEST_LOGS,
    });

    overwriteLoggingStream(prettyStream);

    const testLogger = createLogger('pretty-test', { actor: 'tester' });
    testLogger.info('A pretty message', { extraData: 123 });
    testLogger.warn('A warning');
    testLogger.error('An error', new Error('Something went wrong'));
    testLogger.debug('Debug info', { nested: { data: 'value' } });

    // Pretty output should contain the module name and message in human-readable format
    const output = capturedOutput.lines.join('');

    if (LOG_TEST_LOGS) {
      // eslint-disable-next-line no-console
      console.log(output);
    }

    expect(output).toContain('pretty-test');
    expect(output).toContain('A pretty message');
    expect(output).toContain('extraData');
    expect(output).toContain('123');
    // Should NOT be valid JSON (it's pretty-printed)
    expect(() => JSON.parse(output.trim())).toThrow();
  });

  it('logs instanceId in the output', () => {
    const capturedOutput = new CapturingStream();

    const prettyStream = buildPrettyStream({
      ...pinoPrettyOpts,
      destination: capturedOutput,
      colorize: LOG_TEST_LOGS,
    });

    overwriteLoggingStream(prettyStream);

    const testLogger = createLogger('instance-test', { instanceId: 'slot-42' });
    testLogger.info('Testing instanceId binding');

    const output = capturedOutput.lines.join('');

    if (LOG_TEST_LOGS) {
      // eslint-disable-next-line no-console
      console.log(output);
    }

    expect(output).toContain('instance-test');
    expect(output).toContain('slot-42');
    expect(output).toContain('Testing instanceId binding');
  });

  it('creates child logger preserving bindings', () => {
    const parentLogger = createLogger('parent-module', { instanceId: 'epoch-5' });
    const childLogger = parentLogger.createChild('child');

    capturingStream.clear();
    childLogger.info('Child message');

    const entries = capturingStream.getJsonLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      module: 'parent-module:child',
      instanceId: 'epoch-5',
      msg: 'Child message',
    });
  });

  it('returns bindings via getBindings', () => {
    const testLogger = createLogger('bindings-test', { actor: 'main', instanceId: 'id-123' });
    const bindings = testLogger.getBindings();

    expect(bindings).toEqual({
      actor: 'main',
      instanceId: 'id-123',
    });
  });

  describe('actor colors', () => {
    beforeEach(() => {
      resetActorColors();
    });

    it('returns the same color for the same actor', () => {
      const color1 = getActorColor('my-actor');
      const color2 = getActorColor('my-actor');

      expect(color1).toBe(color2);
    });

    it('resets actor colors with resetActorColors', () => {
      const colorBefore = getActorColor('actor-a');
      resetActorColors();
      const colorAfter = getActorColor('actor-b');

      // After reset, next actor gets the first color (same as actor-a had before)
      expect(colorBefore).toBe(colorAfter);
    });

    it('cycles through colors when more actors than colors', () => {
      const COLOR_COUNT = 8;
      // Get COLOR_COUNT+1 different actors to force cycling
      const colors: ReturnType<typeof getActorColor>[] = [];
      for (let i = 0; i < COLOR_COUNT + 1; i++) {
        colors.push(getActorColor(`actor-${i}`));
      }

      expect(colors[COLOR_COUNT]).toBe(colors[0]);
    });
  });
});
