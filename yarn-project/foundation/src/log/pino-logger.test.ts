import { build as buildPrettyStream } from 'pino-pretty';
import { Writable } from 'stream';
import { inspect } from 'util';

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

  it('converts bigints to strings recursively ', () => {
    const testLogger = createLogger('bigint-test');
    capturingStream.clear();

    testLogger.info('comprehensive bigint conversion', {
      // Top-level bigints
      amount: 123456789012345678901234n,
      slot: 42n,
      // Nested objects
      nested: {
        value: 999999999999999999n,
        deepNested: {
          id: 12345678901234567890n,
        },
      },
      // Arrays with bigints
      array: [1n, 2n, 3n],
      mixedArray: [{ id: 999n }, { id: 888n }],
      // Mixed types
      numberValue: 123,
      stringValue: 'test',
      boolValue: true,
      nullValue: null,
    });

    const entries = capturingStream.getJsonLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      module: 'bigint-test',
      msg: 'comprehensive bigint conversion',
      // All bigints converted to strings
      amount: '123456789012345678901234',
      slot: '42',
      nested: {
        value: '999999999999999999',
        deepNested: {
          id: '12345678901234567890',
        },
      },
      array: ['1', '2', '3'],
      mixedArray: [{ id: '999' }, { id: '888' }],
      // Other types preserved
      numberValue: 123,
      stringValue: 'test',
      boolValue: true,
      nullValue: null,
    });
  });

  it('does not mutate the original log data object', () => {
    const testLogger = createLogger('mutation-test');
    capturingStream.clear();

    const originalData = {
      amount: 123456789012345678901234n,
      nested: {
        value: 999n,
      },
      array: [1n, 2n, 3n],
    };

    // Keep references to verify mutation
    const originalAmount = originalData.amount;
    const originalNestedValue = originalData.nested.value;
    const originalArrayItem = originalData.array[0];

    testLogger.info('mutation test', originalData);

    // Verify the original object was NOT mutated
    expect(originalData.amount).toBe(originalAmount);
    expect(typeof originalData.amount).toBe('bigint');
    expect(originalData.nested.value).toBe(originalNestedValue);
    expect(typeof originalData.nested.value).toBe('bigint');
    expect(originalData.array[0]).toBe(originalArrayItem);
    expect(typeof originalData.array[0]).toBe('bigint');

    // But the logged version should have strings
    const entries = capturingStream.getJsonLines();
    expect(entries[0]).toMatchObject({
      amount: '123456789012345678901234',
      nested: { value: '999' },
      array: ['1', '2', '3'],
    });
  });

  it('serializes objects with toJSON() instead of dumping raw properties', () => {
    const testLogger = createLogger('tojson-test');
    capturingStream.clear();

    // Simulate an EthAddress-like object with an internal buffer and a toJSON method
    const addressLike = {
      buffer: Buffer.from('1234567890abcdef1234567890abcdef12345678', 'hex'),
      toJSON() {
        return '0x1234567890abcdef1234567890abcdef12345678';
      },
    };

    testLogger.info('address logging test', {
      validator: addressLike,
      nested: { addr: addressLike },
      array: [addressLike],
      plainString: 'hello',
    });

    const entries = capturingStream.getJsonLines();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      validator: '0x1234567890abcdef1234567890abcdef12345678',
      nested: { addr: '0x1234567890abcdef1234567890abcdef12345678' },
      array: ['0x1234567890abcdef1234567890abcdef12345678'],
      plainString: 'hello',
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

  describe('formatErr via error logging', () => {
    it('formats error using inspect by default', () => {
      const testLogger = createLogger('format-err-default');
      capturingStream.clear();

      const err = new Error('something broke');
      testLogger.error('operation failed', err);

      const entries = capturingStream.getJsonLines();
      expect(entries).toHaveLength(1);
      const msg = (entries[0] as { msg: string }).msg;
      // inspect formats errors with full stack trace
      expect(msg).toMatch(/^operation failed: Error: something broke\n\s+at/);
    });

    it('falls back to Error name and message when inspect throws', () => {
      const testLogger = createLogger('format-err-test');
      capturingStream.clear();

      // An Error with a custom inspect that throws triggers the first catch
      const err = new Error('original message');
      (err as unknown as Record<symbol, () => void>)[inspect.custom] = () => {
        throw new Error('custom inspect broke');
      };

      testLogger.error('something failed', err);

      const entries = capturingStream.getJsonLines();
      expect(entries).toHaveLength(1);
      expect((entries[0] as { msg: string }).msg).toBe('something failed: Error: original message');
    });

    it('returns unserializable error when both inspect and String throw', () => {
      const testLogger = createLogger('unserializable-test');
      capturingStream.clear();

      // An object where inspect(), toString(), and String() all throw
      const unserializable = {
        [inspect.custom]() {
          throw new Error('custom inspect broke');
        },
        toString() {
          throw new Error('toString broke');
        },
        [Symbol.toPrimitive]() {
          throw new Error('toPrimitive broke');
        },
      };

      testLogger.error('total failure', unserializable);

      const entries = capturingStream.getJsonLines();
      expect(entries).toHaveLength(1);
      expect((entries[0] as { msg: string }).msg).toBe('total failure: [unserializable error]');
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
