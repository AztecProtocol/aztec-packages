import { BarretenbergWasmSyncBackend } from '../bb_backends/wasm.js';
import { SyncApi } from '../cbind/generated/sync.js';
import { BBApiException } from '../bbapi_exception.js';

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

    // In WASM builds, throw_or_abort calls abort directly which throws a generic Error
    // In native builds with exceptions, our try-catch in bbapi converts it to ErrorResponse
    // This test verifies that errors are catchable from bb.js (even if as generic Error in WASM)
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
      expect((error as Error).message).toContain('g1_identity');
      console.log('Successfully caught exception from bb.js with message:', (error as Error).message);
    }
  });
});
