import { BarretenbergWasmSyncBackend } from '../bb_backends/wasm.js';
import { SyncApi } from '../generated/sync.js';

describe('BBApi Exception Handling from bb.js', () => {
  let backend: BarretenbergWasmSyncBackend;
  let api: SyncApi;

  beforeAll(async () => {
    backend = await BarretenbergWasmSyncBackend.new();
    api = new SyncApi(backend);
  }, 60000);

  afterAll(() => {
    backend.destroy();
  });

  it('should catch CRS initialization exceptions from WASM', () => {
    // Create an SrsInitSrs command with invalid data that will cause an exception in C++
    // We pass buffers that are too small, which will cause validation to fail
    const invalidCommand = {
      numPoints: 100, // Request 100 points (requires 6400 bytes)
      pointsBuf: new Uint8Array(10), // Only 10 bytes - will cause exception
      g2Point: new Uint8Array(10), // Only 10 bytes (needs 128) - will cause exception
    };

    // The wasm builds with exception handling, so bbapi's try-catch converts the C++ exception to an ErrorResponse,
    // as it does natively.
    expect(() => {
      api.srsInitSrs(invalidCommand);
    }).toThrow();
  });

  it('should return error message from caught exception', () => {
    const invalidCommand = {
      numPoints: 100,
      pointsBuf: new Uint8Array(10),
      g2Point: new Uint8Array(10),
    };

    try {
      api.srsInitSrs(invalidCommand);
      fail('Expected exception to be thrown');
    } catch (error) {
      // Error is catchable and contains a useful message
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBeTruthy();
      expect((error as Error).message.length).toBeGreaterThan(0);
      expect((error as Error).message).toContain('invalid points_buf size');
    }
  });

  it('answers with an error response rather than aborting the module', async () => {
    const logs: string[] = [];
    const loggingBackend = await BarretenbergWasmSyncBackend.new(undefined, msg => logs.push(msg));
    try {
      expect(() =>
        new SyncApi(loggingBackend).srsInitSrs({
          numPoints: 100,
          pointsBuf: new Uint8Array(10),
          g2Point: new Uint8Array(10),
        }),
      ).toThrow('invalid points_buf size');
      // The JS environment logs this when the module aborts rather than catching the exception itself.
      expect(logs.filter(log => log.includes('aborted'))).toEqual([]);
    } finally {
      loggingBackend.destroy();
    }
  }, 60000);
});
