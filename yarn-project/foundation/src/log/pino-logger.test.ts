import { build as buildPrettyStream } from 'pino-pretty';
import { Writable } from 'stream';

import { createLogger, logger, overwriteLoggingStream, pinoPrettyOpts, registerLoggingStream } from './pino-logger.js';

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
    const logger = createLogger('test-module');

    // Force the logger to log at info level
    logger.info('Hello world', { foo: 'bar' });

    // Check that we captured the log
    expect(capturingStream.lines.length).toBeGreaterThan(0);

    const logEntry = JSON.parse(capturingStream.lines[capturingStream.lines.length - 1]);
    expect(logEntry.module).toBe('test-module');
    expect(logEntry.msg).toBe('Hello world');
    expect(logEntry.foo).toBe('bar');
    expect(logEntry.level).toBe(30); // info level
  });

  it('logs at different levels', () => {
    const logger = createLogger('level-test');
    capturingStream.clear();

    logger.warn('A warning message');
    logger.error('An error message');

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

  it('creates child logger with instanceId binding', () => {
    const parentLogger = createLogger('parent-module');
    const childLogger = parentLogger.createChild('child', { instanceId: 'epoch-5' });

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
});
