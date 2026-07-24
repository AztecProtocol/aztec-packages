import { type AvmStat, type BackendOptions, BackendType, Barretenberg } from '@aztec/bb.js';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { FifoMemoryQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { ProvingError } from '@aztec/stdlib/errors';

import type { UltraHonkFlavor } from '../honk.js';

/**
 * Maps UltraHonkFlavor to the bb.js ProofSystemSettings.
 * All server-side proofs use disableZk: true.
 */
function getProofSettings(flavor: UltraHonkFlavor) {
  const base = { disableZk: true, optimizedSolidityVerifier: false };
  switch (flavor) {
    case 'ultra_honk':
      return { ...base, oracleHashType: 'poseidon2' as const, ipaAccumulation: false };
    case 'ultra_keccak_honk':
      return { ...base, oracleHashType: 'keccak' as const, ipaAccumulation: false };
    case 'ultra_starknet_honk':
      return { ...base, oracleHashType: 'starknet' as const, ipaAccumulation: false };
    case 'ultra_rollup_honk':
      return { ...base, oracleHashType: 'poseidon2' as const, ipaAccumulation: true };
  }
}

/** Result of a successful proof generation via bb.js. */
export type BBJsProofResult = {
  /** Proof fields as 32-byte Uint8Arrays. */
  proofFields: Uint8Array[];
  /** Public input fields as 32-byte Uint8Arrays. */
  publicInputFields: Uint8Array[];
  /** Duration of the proving operation in ms. */
  durationMs: number;
};

/** Public API surface of a bb.js instance, used by the factory and debug wrapper. */
export interface BBJsApi {
  generateProof(
    circuitName: string,
    bytecode: Uint8Array,
    verificationKey: Uint8Array,
    witness: Uint8Array,
    flavor: UltraHonkFlavor,
  ): Promise<BBJsProofResult>;
  verifyProof(
    proofFields: Uint8Array[],
    verificationKey: Uint8Array,
    publicInputFields: Uint8Array[],
    flavor: UltraHonkFlavor,
  ): Promise<{ verified: boolean; durationMs: number }>;
  verifyChonkProof(
    fieldsWithPublicInputs: Uint8Array[],
    verificationKey: Uint8Array,
  ): Promise<{ verified: boolean; durationMs: number }>;
  computeGateCount(
    circuitName: string,
    bytecode: Uint8Array,
    flavor: UltraHonkFlavor | 'mega_honk',
  ): Promise<{ circuitSize: number; durationMs: number }>;
  generateContract(verificationKey: Uint8Array): Promise<{ solidityCode: string; durationMs: number }>;
  /** Generate an AVM proof from serialized inputs. Callers should call verifyAvmProof separately. */
  generateAvmProof(inputs: Uint8Array): Promise<{ proof: Uint8Array[]; stats: AvmStat[]; durationMs: number }>;
  /** Verify an AVM proof against serialized public inputs. */
  verifyAvmProof(proof: Uint8Array[], publicInputs: Uint8Array): Promise<{ verified: boolean; durationMs: number }>;
  /** Check the AVM circuit from serialized inputs. Returns pass/fail and per-stage timings. */
  checkAvmCircuit(inputs: Uint8Array): Promise<{ passed: boolean; stats: AvmStat[]; durationMs: number }>;
  destroy(): Promise<void>;
}

/**
 * Thin wrapper around a single Barretenberg instance.
 * Each instance spawns its own bb process via the NativeUnixSocket backend.
 */
export class BBJsInstance implements BBJsApi {
  private constructor(private api: Barretenberg) {}

  /** Creates a new Barretenberg instance connected to a fresh bb process. */
  static async create(bbPath: string, logger?: LogFn, threads?: number): Promise<BBJsInstance> {
    const options: BackendOptions = {
      bbPath,
      backend: BackendType.NativeUnixSocket,
      logger,
    };
    if (threads !== undefined) {
      options.threads = threads;
    }
    try {
      return new BBJsInstance(await Barretenberg.new(options));
    } catch (err) {
      // bb startup failures are environmental (machine load, a wedged or dead bb process), never a
      // property of the proof inputs, so the job is always safe to retry.
      throw new ProvingError(`Failed to start bb process: ${err}`, err, /*retry*/ true);
    }
  }

  /**
   * Generate an UltraHonk proof for a circuit.
   * @param circuitName - Identifier for the circuit (used by bb internally).
   * @param bytecode - Uncompressed ACIR bytecode.
   * @param verificationKey - The circuit's verification key bytes.
   * @param witness - Uncompressed witness bytes.
   * @param flavor - The UltraHonk flavor to use.
   */
  async generateProof(
    circuitName: string,
    bytecode: Uint8Array,
    verificationKey: Uint8Array,
    witness: Uint8Array,
    flavor: UltraHonkFlavor,
  ): Promise<BBJsProofResult> {
    const timer = new Timer();
    const result = await this.api.circuitProve({
      circuit: {
        name: circuitName,
        bytecode,
        verificationKey,
      },
      witness,
      settings: getProofSettings(flavor),
    });
    return {
      proofFields: result.proof,
      publicInputFields: result.publicInputs,
      durationMs: timer.ms(),
    };
  }

  /**
   * Verify an UltraHonk proof.
   * @param proofFields - Proof fields as 32-byte Uint8Arrays.
   * @param verificationKey - The VK bytes.
   * @param publicInputFields - Public input fields as 32-byte Uint8Arrays.
   * @param flavor - The UltraHonk flavor.
   * @returns Whether the proof is valid.
   */
  async verifyProof(
    proofFields: Uint8Array[],
    verificationKey: Uint8Array,
    publicInputFields: Uint8Array[],
    flavor: UltraHonkFlavor,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const timer = new Timer();
    const result = await this.api.circuitVerify({
      verificationKey,
      publicInputs: publicInputFields,
      proof: proofFields,
      settings: getProofSettings(flavor),
    });
    return { verified: result.verified, durationMs: timer.ms() };
  }

  /**
   * Compute circuit gate count / circuit size.
   * @param circuitName - Identifier for the circuit.
   * @param bytecode - Uncompressed ACIR bytecode.
   * @param flavor - 'mega_honk' for chonk circuits, or an UltraHonk flavor.
   * @returns The dyadic circuit size (next power of 2 of gate count).
   */
  async computeGateCount(
    circuitName: string,
    bytecode: Uint8Array,
    flavor: UltraHonkFlavor | 'mega_honk',
  ): Promise<{ circuitSize: number; durationMs: number }> {
    const timer = new Timer();
    if (flavor === 'mega_honk') {
      const result = await this.api.chonkStats({
        circuit: { name: circuitName, bytecode },
        includeGatesPerOpcode: false,
      });
      return { circuitSize: result.circuitSize, durationMs: timer.ms() };
    }
    const result = await this.api.circuitStats({
      circuit: { name: circuitName, bytecode, verificationKey: new Uint8Array(0) },
      includeGatesPerOpcode: false,
      settings: getProofSettings(flavor),
    });
    return { circuitSize: result.numGatesDyadic, durationMs: timer.ms() };
  }

  /**
   * Generate a Solidity verifier contract from a verification key.
   * @param verificationKey - The VK bytes.
   * @returns The Solidity source code.
   */
  async generateContract(verificationKey: Uint8Array): Promise<{ solidityCode: string; durationMs: number }> {
    const timer = new Timer();
    const result = await this.api.circuitWriteSolidityVerifier({
      verificationKey,
      settings: {
        ipaAccumulation: false,
        oracleHashType: 'poseidon2',
        disableZk: true,
        optimizedSolidityVerifier: false,
      },
    });
    return { solidityCode: result.solidityCode, durationMs: timer.ms() };
  }

  /**
   * Verify a Chonk (IVC) proof passed as flat field elements (with public inputs prepended).
   * The split into structured sub-proofs happens server-side in `ChonkProof::from_field_elements`,
   * so this layer doesn't need to know per-component sub-proof sizes.
   * @param fieldsWithPublicInputs - Flat proof fields as 32-byte Uint8Arrays (public inputs prepended).
   * @param verificationKey - The VK bytes.
   */
  async verifyChonkProof(
    fieldsWithPublicInputs: Uint8Array[],
    verificationKey: Uint8Array,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const timer = new Timer();
    const result = await this.api.chonkVerifyFromFields({ proof: fieldsWithPublicInputs, vk: verificationKey });
    return { verified: result.valid, durationMs: timer.ms() };
  }

  /** Generate an AVM proof from serialized inputs. */
  async generateAvmProof(inputs: Uint8Array): Promise<{ proof: Uint8Array[]; stats: AvmStat[]; durationMs: number }> {
    const timer = new Timer();
    const result = await this.api.avmProve({ inputs });
    return { proof: result.proof, stats: result.stats, durationMs: timer.ms() };
  }

  /** Verify an AVM proof against serialized public inputs. */
  async verifyAvmProof(
    proof: Uint8Array[],
    publicInputs: Uint8Array,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const timer = new Timer();
    const result = await this.api.avmVerify({ proof, publicInputs });
    return { verified: result.verified, durationMs: timer.ms() };
  }

  /** Check the AVM circuit from serialized inputs. */
  async checkAvmCircuit(inputs: Uint8Array): Promise<{ passed: boolean; stats: AvmStat[]; durationMs: number }> {
    const timer = new Timer();
    const result = await this.api.avmCheckCircuit({ inputs });
    return { passed: result.passed, stats: result.stats, durationMs: timer.ms() };
  }

  /** Destroy this instance and kill the underlying bb process. */
  async destroy(): Promise<void> {
    await this.api.destroy();
  }
}

/** Options for {@link BBJsFactory}. */
export interface BBJsFactoryOptions {
  /**
   * Number of long-lived bb processes to keep in the pool.
   * If omitted, every `getInstance()` call spawns a fresh bb that is destroyed on dispose.
   */
  poolSize?: number;
  logger?: Logger;
  threads?: number;
  debugDir?: string;
}

/**
 * Manages bb.js instance lifecycle. By default every `getInstance()` call spawns a fresh
 * bb process that is destroyed when the borrow is disposed. Pass `poolSize` to keep a fixed
 * set of long-lived bb processes that are reused across calls — useful when the per-call
 * bb startup cost dominates the workload (e.g. high-rate IVC verification).
 *
 * Idiomatic usage:
 * ```
 * await using inst = await factory.getInstance();
 * await inst.someMethod(...);
 * // disposed automatically when `inst` goes out of scope
 * ```
 */
export class BBJsFactory {
  private readonly poolSize?: number;
  private readonly logger?: Logger;
  private readonly threads?: number;
  private readonly debugDir?: string;

  /** Available pooled instances when poolSize is set; otherwise undefined. */
  private pool?: FifoMemoryQueue<BBJsApi>;
  /** Lazily-resolved on first `getInstance()` call to prevent racing pool initialization. */
  private initPromise?: Promise<void>;
  private destroyed = false;

  constructor(
    private bbPath: string,
    options: BBJsFactoryOptions = {},
  ) {
    this.poolSize = options.poolSize;
    this.logger = options.logger;
    this.threads = options.threads;
    this.debugDir = options.debugDir;
    if (this.poolSize !== undefined && this.poolSize < 1) {
      throw new Error(`BBJsFactory poolSize must be >= 1, got ${this.poolSize}`);
    }
  }

  /**
   * Acquire a bb instance. The returned object implements `BBJsApi` and `AsyncDisposable`.
   * With no pool: spawns a fresh bb that is destroyed on dispose. With a pool: borrows from
   * the pool and returns to it on dispose.
   */
  async getInstance(): Promise<BBJsApi & AsyncDisposable> {
    if (this.destroyed) {
      throw new Error('BBJsFactory has been destroyed');
    }
    if (this.poolSize === undefined) {
      // No pool: fresh-per-call, dispose destroys.
      const instance = await this.createInstance();
      return this.makeOwned(instance);
    }
    if (!this.initPromise) {
      this.initPromise = this.initPool();
    }
    await this.initPromise;
    const pool = this.pool;
    if (!pool) {
      throw new Error('BBJsFactory has been destroyed');
    }
    const instance = await pool.get();
    if (!instance) {
      throw new Error('BBJsFactory was destroyed while waiting for an instance');
    }
    return this.makeBorrowed(instance);
  }

  /**
   * Tear down all pooled instances. Idempotent. No-op when no pool is configured (fresh-per-call
   * instances are destroyed by their own dispose callbacks). Instances currently held by an
   * in-flight pooled borrow are destroyed by their dispose callback when released.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const pool = this.pool;
    this.pool = undefined;
    if (!pool) {
      return;
    }
    const idle: BBJsApi[] = [];
    while (pool.length() > 0) {
      const item = pool.getImmediate();
      if (item) {
        idle.push(item);
      }
    }
    pool.cancel();
    // Aggregate teardown failures so a single bb child that fails to shut down doesn't mask others.
    const results = await Promise.allSettled(idle.map(item => item.destroy()));
    const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => r.reason);
    if (errors.length > 0) {
      throw new AggregateError(errors, `BBJsFactory.destroy: ${errors.length} bb instance(s) failed to shut down`);
    }
  }

  private async initPool(): Promise<void> {
    // Use allSettled so that if any createInstance() rejects we can destroy the rest instead of
    // leaking bb child processes whose creation succeeded.
    const results = await Promise.allSettled(Array.from({ length: this.poolSize! }, () => this.createInstance()));
    const items: BBJsApi[] = [];
    const errors: unknown[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        items.push(result.value);
      } else {
        errors.push(result.reason);
      }
    }
    if (errors.length > 0 || this.destroyed) {
      // Either creation failed or destroy() raced ahead — clean up everything we successfully spawned.
      await Promise.all(items.map(item => item.destroy()));
      if (errors.length > 0) {
        throw errors[0];
      }
      return;
    }
    const pool = new FifoMemoryQueue<BBJsApi>();
    for (const item of items) {
      pool.put(item);
    }
    this.pool = pool;
  }

  private async createInstance(): Promise<BBJsApi> {
    const logFn = this.logger ? (msg: string) => this.logger!.verbose(`bb.js - ${msg}`) : undefined;
    const raw = await BBJsInstance.create(this.bbPath, logFn, this.threads);
    return this.maybeWrapDebug(raw);
  }

  /** Wrap the instance in a debug wrapper if debugDir is configured. */
  private async maybeWrapDebug(instance: BBJsInstance): Promise<BBJsApi> {
    if (this.debugDir && this.logger) {
      const { DebugBBJsInstance } = await import('./bb_js_debug.js');
      return new DebugBBJsInstance(instance, this.debugDir, this.bbPath, this.logger);
    }
    return instance;
  }

  /**
   * Wrap a fresh instance with an `AsyncDisposable` that destroys it on dispose. Used when no
   * pool is configured. Destroy errors are propagated so that a teardown failure (e.g. a bb child
   * that didn't shut down cleanly) surfaces instead of being silently swallowed.
   */
  private makeOwned(instance: BBJsApi): BBJsApi & AsyncDisposable {
    return this.makeDisposable(instance, () => instance.destroy());
  }

  /**
   * Wrap a pooled instance with an `AsyncDisposable` that returns it to the pool (or destroys it
   * if the factory was destroyed in the meantime). Destroy errors are propagated.
   */
  private makeBorrowed(instance: BBJsApi): BBJsApi & AsyncDisposable {
    return this.makeDisposable(instance, async () => {
      const pool = this.pool;
      if (pool && !this.destroyed) {
        pool.put(instance);
      } else {
        await instance.destroy();
      }
    });
  }

  private makeDisposable(instance: BBJsApi, onDispose: () => void | Promise<void>): BBJsApi & AsyncDisposable {
    let disposed = false;
    const dispose = async (): Promise<void> => {
      if (disposed) {
        return;
      }
      disposed = true;
      await onDispose();
    };
    return new Proxy(instance as BBJsApi & AsyncDisposable, {
      get(target, prop, receiver) {
        if (prop === Symbol.asyncDispose) {
          return dispose;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
}
