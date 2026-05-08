import { type AvmStat, type BackendOptions, BackendType, Barretenberg, type ChonkProof } from '@aztec/bb.js';
import { IPA_PROOF_LENGTH } from '@aztec/constants';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { FifoMemoryQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';

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
    const api = await Barretenberg.new(options);
    return new BBJsInstance(api);
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
   * Verify a Chonk (IVC) proof by splitting flat fields into the structured ChonkProof format.
   * Mirrors C++ ChonkProof::from_field_elements() logic.
   * @param fieldsWithPublicInputs - Flat proof fields as 32-byte Uint8Arrays (public inputs prepended).
   * @param verificationKey - The VK bytes.
   */
  async verifyChonkProof(
    fieldsWithPublicInputs: Uint8Array[],
    verificationKey: Uint8Array,
  ): Promise<{ verified: boolean; durationMs: number }> {
    const timer = new Timer();
    const proof = splitChonkProofToStructured(fieldsWithPublicInputs);
    const result = await this.api.chonkVerify({ proof, vk: verificationKey });
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

/**
 * Factory for managing BBJsInstance lifecycle.
 * Provides fresh instances for proving (each spawns a new bb process) and a
 * fixed-size pool of long-lived instances for verification.
 */
export class BBJsProverFactory {
  /** Available pooled verifier instances; callers acquire via `get()` and return via `put()`. */
  private verifierPool?: FifoMemoryQueue<BBJsApi>;
  /** All pooled instances (whether currently in or out of the pool), tracked for shutdown. */
  private verifierPoolItems: BBJsApi[] = [];

  constructor(
    private bbPath: string,
    private logger?: Logger,
    private threads?: number,
    private debugDir?: string,
  ) {}

  /**
   * Pre-spawn `size` long-lived bb instances reused across `withVerifierInstance` calls.
   * Without this, `withVerifierInstance` falls back to spawning a fresh bb per call.
   * Must be paired with `stopVerifierPool` for clean shutdown.
   */
  async startVerifierPool(size: number): Promise<void> {
    if (this.verifierPool) {
      throw new Error('Verifier pool already started');
    }
    if (size <= 0) {
      return;
    }
    const items = await Promise.all(Array.from({ length: size }, () => this.createInstance()));
    const pool = new FifoMemoryQueue<BBJsApi>();
    for (const item of items) {
      pool.put(item);
    }
    this.verifierPool = pool;
    this.verifierPoolItems = items;
  }

  /**
   * Tear down idle pooled verifier instances and reject future acquires. Idempotent.
   * Instances currently held by an in-flight `withVerifierInstance` call are destroyed by that
   * call's finally block once it returns.
   */
  async stopVerifierPool(): Promise<void> {
    const pool = this.verifierPool;
    if (!pool) {
      return;
    }
    this.verifierPool = undefined;
    this.verifierPoolItems = [];
    const idle: BBJsApi[] = [];
    while (pool.length() > 0) {
      const item = pool.getImmediate();
      if (item) {
        idle.push(item);
      }
    }
    pool.cancel();
    await Promise.all(idle.map(item => item.destroy()));
  }

  /**
   * Run an operation with a fresh Barretenberg instance.
   * The instance is created before the operation and destroyed after.
   * Suitable for proving where process startup is negligible relative to proof time.
   */
  async withFreshInstance<T>(fn: (instance: BBJsApi) => Promise<T>): Promise<T> {
    const instance = await this.createInstance();
    try {
      return await fn(instance);
    } finally {
      await instance.destroy();
    }
  }

  /**
   * Run a verification operation, reusing a pooled instance if `startVerifierPool` was called.
   * Falls back to a fresh-spawn per call when no pool is configured.
   */
  async withVerifierInstance<T>(fn: (instance: BBJsApi) => Promise<T>): Promise<T> {
    const pool = this.verifierPool;
    if (!pool) {
      return this.withFreshInstance(fn);
    }
    const instance = await pool.get();
    if (!instance) {
      // Pool was cancelled (stopVerifierPool ran) while we were waiting.
      throw new Error('Verifier pool stopped while waiting for an instance');
    }
    try {
      return await fn(instance);
    } finally {
      if (this.verifierPool === pool) {
        pool.put(instance);
      } else {
        // Pool was stopped while we held this instance; destroy it ourselves.
        await instance.destroy().catch(() => {});
      }
    }
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
}

/**
 * Split a flat Chonk proof field array into the structured ChonkProof format expected by bb.js chonkVerify.
 * Mirrors C++ ChonkProof::from_field_elements() in barretenberg/cpp/src/barretenberg/chonk/chonk_proof.cpp,
 * which derives the hiding_oink_proof size as the remainder after subtracting the 4 fixed-size sub-proofs.
 * This makes the split automatically adapt to any number of public inputs prepended to the oink portion.
 *
 * The 4 fixed sub-proof sizes below must match C++. If the Chonk proof layout changes in C++, expect
 * verification to start failing with cryptic verifier errors; update the constants here to match.
 */
function splitChonkProofToStructured(fields: Uint8Array[]): ChonkProof {
  // Fixed sub-proof sizes — must match C++ ChonkProof layout.
  const MERGE_PROOF_SIZE = 42; // bb::MERGE_PROOF_SIZE
  const ECCVM_PROOF_LENGTH = 608; // bb::ECCVMFlavor::PROOF_LENGTH
  const JOINT_PROOF_LENGTH = 489; // bb::ChonkProof::JOINT_PROOF_LENGTH

  const fixedTailSize = MERGE_PROOF_SIZE + ECCVM_PROOF_LENGTH + IPA_PROOF_LENGTH + JOINT_PROOF_LENGTH;
  if (fields.length < fixedTailSize) {
    throw new Error(
      `splitChonkProofToStructured: proof too short (got ${fields.length} fields, need at least ${fixedTailSize})`,
    );
  }

  // hiding_oink_proof absorbs the leading portion (public inputs + oink payload); size is derived.
  const oinkSize = fields.length - fixedTailSize;
  let offset = 0;
  const hidingOinkProof = fields.slice(offset, (offset += oinkSize));
  const mergeProof = fields.slice(offset, (offset += MERGE_PROOF_SIZE));
  const eccvmProof = fields.slice(offset, (offset += ECCVM_PROOF_LENGTH));
  const ipaProof = fields.slice(offset, (offset += IPA_PROOF_LENGTH));
  const jointProof = fields.slice(offset, (offset += JOINT_PROOF_LENGTH));

  return { hidingOinkProof, mergeProof, eccvmProof, ipaProof, jointProof };
}
