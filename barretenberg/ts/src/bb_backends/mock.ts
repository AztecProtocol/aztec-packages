/**
 * Mock backend for testing without the BB binary.
 *
 * This backend returns predefined responses for all commands,
 * making it useful for:
 * - Unit testing code that uses the Barretenberg API
 * - Development without building the C++ binary
 * - Integration testing of the API layer
 *
 * @example
 * ```typescript
 * import { MockBackend } from './bb_backends/mock';
 *
 * const backend = new MockBackend();
 * const input = encode([["Blake2s", { data: new Uint8Array([1, 2, 3]) }]]);
 * const output = backend.call(input);
 * ```
 */

import { encode, decode } from 'msgpackr';
import type { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';

/**
 * Mock responses keyed by command name.
 * Add more commands as needed.
 */
const MOCK_RESPONSES: Record<string, unknown> = {
  Blake2s: { hash: new Uint8Array(32) },
  Blake2sToField: { field: new Uint8Array(32) },
  PedersenHash: { hash: new Uint8Array(32) },
  PedersenHashBuffer: { hash: new Uint8Array(32) },
  PedersenCommit: {
    point: {
      x: new Uint8Array(32),
      y: new Uint8Array(32),
    },
  },
  Poseidon2Hash: { hash: new Uint8Array(32) },
  Poseidon2HashAccumulate: { hash: new Uint8Array(32) },
  SrsInitSrs: { dummy: 0 },
  SrsInitGrumpkinSrs: { dummy: 0 },
  Shutdown: {},
  CircuitProve: {
    public_inputs: [],
    proof: [new Uint8Array(32)],
    vk: {
      bytes: new Uint8Array(32),
      fields: [],
      hash: new Uint8Array(32),
    },
  },
  CircuitVerify: { verified: true },
  CircuitComputeVk: {
    bytes: new Uint8Array(32),
    fields: [],
    hash: new Uint8Array(32),
  },
  CircuitStats: {
    num_gates: 0,
    num_gates_dyadic: 0,
    num_acir_opcodes: 0,
    gates_per_opcode: [],
  },
};

/**
 * Synchronous mock backend for testing.
 */
export class MockBackendSync implements IMsgpackBackendSync {
  /** Number of calls made to this backend */
  public callCount = 0;

  /** Last command name received (for verification in tests) */
  public lastCommand: string | null = null;

  call(inputBuffer: Uint8Array): Uint8Array {
    this.callCount++;

    // Decode the input to extract command name
    // Commands are encoded as: [[commandName, data]]
    const commands = decode(inputBuffer) as Array<[string, unknown]>;
    if (!commands || commands.length === 0) {
      throw new Error('Empty command list');
    }

    const [commandName] = commands[0];
    this.lastCommand = commandName;

    // Get mock response or return empty shutdown response
    const response = MOCK_RESPONSES[commandName] ?? {};

    return encode(response);
  }

  destroy(): void {
    // Nothing to clean up
  }
}

/**
 * Asynchronous mock backend for testing.
 */
export class MockBackendAsync implements IMsgpackBackendAsync {
  private sync = new MockBackendSync();

  /** Number of calls made to this backend */
  get callCount(): number {
    return this.sync.callCount;
  }

  /** Last command name received (for verification in tests) */
  get lastCommand(): string | null {
    return this.sync.lastCommand;
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // Simulate async behavior
    return Promise.resolve(this.sync.call(inputBuffer));
  }

  async destroy(): Promise<void> {
    // Nothing to clean up
  }
}

// Re-export types for convenience
export type { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';
