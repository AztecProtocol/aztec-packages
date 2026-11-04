import { BbError, ChonkProof, ChonkProveResponse, fromChonkProof, toChonkProof } from '@aztec-foundation/bb.js-api';
import { Decoder, Encoder } from 'msgpackr';
import { ungzip } from 'pako';

import { CircuitKind } from '../circuit_kind.js';
import { ProofData, hexToUint8Array, uint8ArrayToHex } from '../proof.js';
import type { Barretenberg } from './index.js';

export class AztecClientBackendError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Target verification environment for proof generation.
 * This determines the hash function used and whether zero-knowledge is enabled.
 */
export type VerifierTarget =
  | 'evm' // Ethereum/Solidity verification (keccak, ZK enabled)
  | 'evm-no-zk' // Ethereum/Solidity without zero-knowledge
  | 'noir-recursive' // Recursive verification in Noir circuits (poseidon2, ZK enabled)
  | 'noir-recursive-no-zk' // Recursive verification without ZK
  | 'noir-rollup' // Rollup circuits with IPA accumulation (poseidon2, ZK enabled)
  | 'noir-rollup-no-zk' // Rollup circuits without ZK
  | 'starknet' // Starknet verification via Garaga (ZK enabled)
  | 'starknet-no-zk'; // Starknet without zero-knowledge

/**
 * Options for the UltraHonkBackend.
 */
export type UltraHonkBackendOptions = {
  /**
   * Target verification environment. Determines hash function and ZK settings.
   * This is the recommended way to configure proof generation.
   *
   * @example
   * // For EVM/Solidity verification
   * backend.generateProof(witness, { verifierTarget: 'evm' });
   *
   * // For recursive verification in Noir
   * backend.generateProof(witness, { verifierTarget: 'noir-recursive' });
   */
  verifierTarget?: VerifierTarget;

  // Legacy options - prefer using verifierTarget instead

  /** @deprecated Use verifierTarget: 'evm-no-zk' instead */
  keccak?: boolean;
  /** @deprecated Use verifierTarget: 'evm' instead */
  keccakZK?: boolean;
  /** @deprecated Use verifierTarget: 'starknet-no-zk' instead */
  starknet?: boolean;
  /** @deprecated Use verifierTarget: 'starknet' instead */
  starknetZK?: boolean;
};

function getProofSettingsFromOptions(options?: UltraHonkBackendOptions): {
  ipaAccumulation: boolean;
  oracleHashType: string;
  disableZk: boolean;
  optimizedSolidityVerifier: boolean;
} {
  // Check for conflicting options - verifierTarget should not be combined with legacy options
  if (options?.verifierTarget) {
    const legacyOptions = [options.keccak, options.keccakZK, options.starknet, options.starknetZK].filter(Boolean);
    if (legacyOptions.length > 0) {
      throw new Error(
        'Cannot use verifierTarget with legacy options (keccak, keccakZK, starknet, starknetZK). ' +
          'Use verifierTarget alone.',
      );
    }

    switch (options.verifierTarget) {
      case 'evm':
        return { ipaAccumulation: false, oracleHashType: 'keccak', disableZk: false, optimizedSolidityVerifier: false };
      case 'evm-no-zk':
        return { ipaAccumulation: false, oracleHashType: 'keccak', disableZk: true, optimizedSolidityVerifier: false };
      case 'noir-recursive':
        return {
          ipaAccumulation: false,
          oracleHashType: 'poseidon2',
          disableZk: false,
          optimizedSolidityVerifier: false,
        };
      case 'noir-recursive-no-zk':
        return {
          ipaAccumulation: false,
          oracleHashType: 'poseidon2',
          disableZk: true,
          optimizedSolidityVerifier: false,
        };
      case 'noir-rollup':
        return {
          ipaAccumulation: true,
          oracleHashType: 'poseidon2',
          disableZk: false,
          optimizedSolidityVerifier: false,
        };
      case 'noir-rollup-no-zk':
        return {
          ipaAccumulation: true,
          oracleHashType: 'poseidon2',
          disableZk: true,
          optimizedSolidityVerifier: false,
        };
      case 'starknet':
        return {
          ipaAccumulation: false,
          oracleHashType: 'starknet',
          disableZk: false,
          optimizedSolidityVerifier: false,
        };
      case 'starknet-no-zk':
        return {
          ipaAccumulation: false,
          oracleHashType: 'starknet',
          disableZk: true,
          optimizedSolidityVerifier: false,
        };
    }
  }

  // Legacy options support (deprecated)
  return {
    ipaAccumulation: false,
    oracleHashType:
      options?.keccak || options?.keccakZK
        ? 'keccak'
        : options?.starknet || options?.starknetZK
          ? 'starknet'
          : 'poseidon2',
    disableZk: options?.keccak || options?.starknet ? true : false,
    optimizedSolidityVerifier: false,
  };
}

export class UltraHonkVerifierBackend {
  constructor(private api: Barretenberg) {}

  async verifyProof(
    proofData: ProofData & { verificationKey: Uint8Array },
    options?: UltraHonkBackendOptions,
  ): Promise<boolean> {
    const proofFrs: Uint8Array[] = [];
    for (let i = 0; i < proofData.proof.length; i += 32) {
      proofFrs.push(proofData.proof.slice(i, i + 32));
    }
    const { verified } = await this.api.circuitVerify({
      verificationKey: proofData.verificationKey,
      publicInputs: proofData.publicInputs.map(hexToUint8Array),
      proof: proofFrs,
      settings: getProofSettingsFromOptions(options),
    });
    return verified;
  }
}

export class UltraHonkBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  private acirUncompressedBytecode: Uint8Array;

  constructor(
    acirBytecode: string,
    private api: Barretenberg,
  ) {
    this.acirUncompressedBytecode = acirToUint8Array(acirBytecode);
  }

  async generateProof(compressedWitness: Uint8Array, options?: UltraHonkBackendOptions): Promise<ProofData> {
    const witness = ungzip(compressedWitness);
    const { proof, publicInputs } = await this.api.circuitProve({
      witness,
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
        verificationKey: new Uint8Array(0), // Empty VK - lower performance.
      },
      settings: getProofSettingsFromOptions(options),
    });
    // We return ProofData as a flat buffer and an array of strings to match the current ProofData class.
    const flatProof = new Uint8Array(proof.length * 32);
    proof.forEach((fr, i) => {
      flatProof.set(fr, i * 32);
    });

    return { proof: flatProof, publicInputs: publicInputs.map(uint8ArrayToHex) };
  }

  async verifyProof(proofData: ProofData, options?: UltraHonkBackendOptions): Promise<boolean> {
    const proofFrs: Uint8Array[] = [];
    for (let i = 0; i < proofData.proof.length; i += 32) {
      proofFrs.push(proofData.proof.slice(i, i + 32));
    }
    // TODO reconsider API - computing the VK at this point is not optimal
    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
      },
      settings: getProofSettingsFromOptions(options),
    });
    const { verified } = await this.api.circuitVerify({
      verificationKey: vkResult.bytes,
      publicInputs: proofData.publicInputs.map(hexToUint8Array),
      proof: proofFrs,
      settings: getProofSettingsFromOptions(options),
    });
    return verified;
  }

  async getVerificationKey(options?: UltraHonkBackendOptions): Promise<Uint8Array> {
    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
      },
      settings: getProofSettingsFromOptions(options),
    });
    return vkResult.bytes;
  }

  /** @description Returns a solidity verifier */
  async getSolidityVerifier(vk: Uint8Array, options?: UltraHonkBackendOptions): Promise<string> {
    const result = await this.api.circuitWriteSolidityVerifier({
      verificationKey: vk,
      settings: getProofSettingsFromOptions(options),
    });
    return result.solidityCode;
  }

  // TODO(https://github.com/noir-lang/noir/issues/5661): Update this to handle Honk recursive aggregation in the browser once it is ready in the backend itself
  async generateRecursiveProofArtifacts(
    _proof: Uint8Array,
    _numOfPublicInputs: number,
    options?: UltraHonkBackendOptions,
  ): Promise<{ proofAsFields: string[]; vkAsFields: string[]; vkHash: string }> {
    // TODO(https://github.com/noir-lang/noir/issues/5661): This needs to be updated to handle recursive aggregation.
    // There is still a proofAsFields method but we could consider getting rid of it as the proof itself
    // is a list of field elements.
    // UltraHonk also does not have public inputs directly prepended to the proof and they are still instead
    // inserted at an offset.
    // const proof = reconstructProofWithPublicInputs(proofData);
    // const proofAsFields = (await this.api.acirProofAsFieldsUltraHonk(proof)).slice(numOfPublicInputs);

    const vkResult = await this.api.circuitComputeVk({
      circuit: {
        name: 'circuit',
        bytecode: this.acirUncompressedBytecode,
      },
      settings: getProofSettingsFromOptions(options),
    });

    // Convert VK bytes to field elements (32-byte chunks)
    const vkAsFields: string[] = [];
    for (let i = 0; i < vkResult.bytes.length; i += 32) {
      const chunk = vkResult.bytes.slice(i, i + 32);
      vkAsFields.push(uint8ArrayToHex(chunk));
    }

    return {
      // TODO(https://github.com/noir-lang/noir/issues/5661)
      proofAsFields: [],
      vkAsFields,
      // We use an empty string for the vk hash here as it is unneeded as part of the recursive artifacts
      // The user can be expected to hash the vk inside their circuit to check whether the vk is the circuit
      // they expect
      vkHash: uint8ArrayToHex(vkResult.hash),
    };
  }
}

/**
 * Result of proving with the AztecClientBackend.
 */
export interface AztecClientProveResult {
  /** Flat proof field elements (Uint8Array[] of 32-byte fields, includes public inputs). */
  proofFields: Uint8Array[];
  /** Msgpack-encoded ChonkProof (for verification via the bb API). */
  proof: Uint8Array;
  /** Verification key bytes. */
  vk: Uint8Array;
  /** Chonk-compressed proof bytes (point compression + u256 encoding, ~1.7x smaller). */
  compressedProof?: Uint8Array;
}

/** Options for {@link AztecClientBackend.prove}. */
export type AztecClientProveOptions = {
  /** Compress the proof after verifying it. */
  compress?: boolean;
  /** Aborts the proof; see {@link AztecClientBackend.prove} for what an abort does at each point. */
  signal?: AbortSignal;
};

/**
 * What bb answers a Chonk command with once an interrupt stopped it (`INTERRUPTED_MESSAGE` in bb's
 * `common/interrupt.hpp`).
 */
export const INTERRUPTED_MESSAGE = 'bb: interrupted';

/**
 * How long a fence waits for bb to report an interrupt it was sent. A signal or an atomic store reaches a scheduled
 * process within microseconds, so a binary silent for a second ignores interrupts or is starved of CPU; a second
 * tolerates heavy scheduler delay and still keeps an abort prompt for a user.
 */
const FENCE_DEADLINE_MS = 1000;

/** Spacing of a fence's reads: adds at most this to an abort, and bounds a fence at 100 reads. */
const FENCE_RETRY_MS = 10;

/**
 * The last `prove()` of each instance, settling once it and every earlier one has. A proof issued before an aborted
 * one's fence would reach bb ahead of that fence's `clearInterrupt` and fail on the flag still set.
 */
const proveTurns = new WeakMap<Barretenberg, Promise<void>>();

type FenceOutcome = 'cleared' | 'unsupported' | 'transport-failed' | 'deadline';

function isInterruption(error: unknown): boolean {
  return error instanceof BbError && error.message === INTERRUPTED_MESSAGE;
}

/** Resolves after one macrotask: a direct wasm call answers synchronously, so only then can a timer or an event run. */
function nextMacrotask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Waits for `turn`, or rejects with the signal's reason as soon as it aborts. */
function waitForTurn(turn: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return turn;
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    void turn.then(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

/**
 * Reads `clearInterrupt` until bb reports it cleared an interrupt. Transport calls have no timeout, so a deadline races
 * the reads; a read still pending then settles on its own.
 */
async function readUntilInterruptCleared(api: Barretenberg): Promise<FenceOutcome> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<FenceOutcome>(resolve => {
    timer = setTimeout(() => resolve('deadline'), FENCE_DEADLINE_MS);
  });
  const reads = (async (): Promise<FenceOutcome> => {
    while (!expired) {
      try {
        if ((await api.clearInterrupt({})).interrupted) {
          return 'cleared';
        }
      } catch (error) {
        // bb answers ClearInterrupt with an error only when it does not know the command.
        return error instanceof BbError ? 'unsupported' : 'transport-failed';
      }
      await new Promise(resolve => setTimeout(resolve, FENCE_RETRY_MS));
    }
    return 'deadline';
  })();
  try {
    return await Promise.race([reads, deadline]);
  } finally {
    expired = true;
    clearTimeout(timer);
  }
}

/**
 * Flatten a structured bb.js ChonkProof into a flat array of field element Uint8Arrays.
 * The order matches the C++ ChonkProof::to_field_elements() layout.
 */
export function flattenChonkProofFields(proof: ChonkProof): Uint8Array[] {
  return [proof.hidingOinkProof, proof.mergeProof, proof.eccvmProof, proof.ipaProof, proof.jointProof].flat();
}

export class AztecClientBackend {
  // These type assertions are used so that we don't
  // have to initialize `api` in the constructor.
  // These are initialized asynchronously in the `init` function,
  // constructors cannot be asynchronous which is why we do this.

  constructor(
    private acirBuf: Uint8Array[],
    private api: Barretenberg,
    private circuitNames: string[] = [],
    private circuitKinds: CircuitKind[] = [],
  ) {
    if (acirBuf.length > 0 && circuitKinds.length !== acirBuf.length) {
      throw new AztecClientBackendError(
        `circuitKinds must have one entry per bytecode (got ${circuitKinds.length} kinds for ${acirBuf.length} circuits)`,
      );
    }
    // Guard against sparse/undefined entries: an undefined kind serializes to the C++ App default
    // and would silently select the wrong flavor for kernel circuits.
    circuitKinds.forEach((kind, i) => {
      if (!(kind in CircuitKind)) {
        throw new AztecClientBackendError(`circuitKinds[${i}] is not a valid CircuitKind (got ${kind})`);
      }
    });
  }

  /**
   * Proves a Chonk transaction from one witness and one precomputed VK per circuit.
   *
   * `prove()` calls on one {@link Barretenberg} run one after another. With `options.signal`, an abort rejects with
   * `signal.reason` once bb has stopped and the instance is ready for the next proof:
   * - before the call, or while an earlier `prove()` on the instance runs: nothing is sent to bb;
   * - while bb proves, on an {@link Barretenberg.interruptible} instance: bb stops the command it is running;
   * - otherwise, and during the verification and compression that follow: the command in hand finishes and no
   *   further one is issued.
   *
   * Argument errors are thrown before an abort is looked at, and a failure that races the abort is rethrown in place
   * of the reason.
   */
  async prove(
    witnessBuf: Uint8Array[],
    vksBuf?: Uint8Array[],
    options?: AztecClientProveOptions,
  ): Promise<AztecClientProveResult> {
    vksBuf = vksBuf ?? [];
    if (vksBuf.length !== 0 && this.acirBuf.length !== witnessBuf.length) {
      throw new AztecClientBackendError('Witness and bytecodes must have the same stack depth!');
    }
    if (vksBuf.length !== 0 && vksBuf.length !== witnessBuf.length) {
      // NOTE: we allow 0 as an explicit 'I have no VKs'. This is a deprecated feature.
      throw new AztecClientBackendError('Witness and VKs must have the same stack depth!');
    }

    for (let i = 0; i < this.acirBuf.length; i++) {
      if (!vksBuf[i]?.length) {
        const functionName = this.circuitNames[i] || `circuit_${i}`;
        throw new AztecClientBackendError(
          `Missing precomputed VK for circuit ${i} (${functionName}). ` +
            'Callers must supply the precomputed VK pinned alongside the circuit artifact.',
        );
      }
    }

    const signal = options?.signal;
    signal?.throwIfAborted();
    const { previous, release } = this.joinTurn();
    try {
      if (previous) {
        await waitForTurn(previous, signal);
        // The abort can land after the turn passed and before this resumes.
        signal?.throwIfAborted();
      }
      const result = await this.proveInTurn(witnessBuf, vksBuf, signal, options?.compress);
      // Nothing is awaited between this check and settling, so an abort that lands before prove() settles rejects it.
      if (signal?.aborted) {
        await this.abandon(signal, [], false);
      }
      return result;
    } finally {
      release();
    }
  }

  /** Queues a `prove()` on this instance; with no `previous`, it may start at once. */
  private joinTurn(): { previous?: Promise<void>; release: () => void } {
    const previous = proveTurns.get(this.api);
    let release!: () => void;
    const settled = new Promise<void>(resolve => (release = resolve));
    const tail = previous ? previous.then(() => settled) : settled;
    proveTurns.set(this.api, tail);
    void tail.then(() => {
      if (proveTurns.get(this.api) === tail) {
        proveTurns.delete(this.api);
      }
    });
    return { previous, release };
  }

  private async proveInTurn(
    witnessBuf: Uint8Array[],
    vksBuf: Uint8Array[],
    signal: AbortSignal | undefined,
    compress: boolean | undefined,
  ): Promise<AztecClientProveResult> {
    // CircuitKind values travel as u8 on the wire.
    const commands: (() => Promise<unknown>)[] = [
      () => this.api.chonkStart({ kinds: Uint8Array.from(this.circuitKinds) }),
    ];
    for (let i = 0; i < this.acirBuf.length; i++) {
      commands.push(() =>
        this.api.chonkLoad({
          circuit: {
            name: this.circuitNames[i] || `circuit_${i}`,
            bytecode: this.acirBuf[i],
            verificationKey: vksBuf[i],
          },
          kind: this.circuitKinds[i],
        }),
      );
      commands.push(() => this.api.chonkAccumulate({ witness: witnessBuf[i] || new Uint8Array(0) }));
    }
    commands.push(() => this.api.chonkProve({}));
    const oneAtATime = signal !== undefined && !this.api.interruptible;
    const proveResult = (
      oneAtATime ? await this.runOneAtATime(commands, signal) : await this.runPipelined(commands, signal)
    ) as ChonkProveResponse;

    const proof = new Encoder({ useRecords: false }).encode(fromChonkProof(proveResult.proof));
    const lastIdx = this.acirBuf.length - 1;
    if (this.circuitKinds[lastIdx] !== CircuitKind.HidingKernel) {
      throw new AztecClientBackendError(
        `Last circuit must be tagged CircuitKind.HidingKernel, got ${this.circuitKinds[lastIdx]}.`,
      );
    }
    const hidingKernelVk = vksBuf[lastIdx];

    const proofFields = flattenChonkProofFields(proveResult.proof);

    // bb does not interrupt verification or compression: an abort lets the one running finish and skips the rest.
    // Verify using native proof directly to avoid redundant encode/decode cycle
    const verified = await this.unlessAborted(signal, oneAtATime, () =>
      this.verifyNative(proveResult.proof, hidingKernelVk),
    );
    if (!verified) {
      throw new AztecClientBackendError('Failed to verify the private (Chonk) transaction proof!');
    }

    const compressedProof = compress
      ? await this.unlessAborted(
          signal,
          oneAtATime,
          async () => (await this.api.chonkCompressProof({ proof: proveResult.proof })).compressedProof,
        )
      : undefined;

    if (oneAtATime) {
      // Lets an abort raised during a synchronous last step land before prove() checks the signal.
      await nextMacrotask();
    }
    return { proofFields, proof, vk: hidingKernelVk, compressedProof };
  }

  /**
   * Runs a step that follows proving unless the proof was aborted. The check and the call share one synchronous run,
   * so no abort lands between them; when bb's calls answer synchronously, a macrotask passes first.
   */
  private async unlessAborted<T>(
    signal: AbortSignal | undefined,
    oneAtATime: boolean,
    step: () => Promise<T>,
  ): Promise<T> {
    if (oneAtATime) {
      await nextMacrotask();
    }
    if (signal?.aborted) {
      return await this.abandon(signal, [], false);
    }
    return await step();
  }

  /**
   * Issues every command before awaiting any, so proving pays one round trip rather than one per command, and returns
   * the last one's result. Inputs are validated before this, so nothing throws between issuing and awaiting.
   */
  private async runPipelined(commands: (() => Promise<unknown>)[], signal?: AbortSignal): Promise<unknown> {
    const issued = commands.map(issue => issue());
    let startReplied = false;
    let fenceDecided = false;
    let interruptRequested = false;
    let interruptDelivered = false;
    // Held until chonkStart answers, since bb may still be running another caller's command queued ahead of it.
    // Never sent once the fence is decided: a flag set after it would fail the next proof.
    const requestInterrupt = () => {
      if (signal?.aborted && startReplied && !fenceDecided && !interruptRequested) {
        interruptRequested = true;
        interruptDelivered = this.api.interrupt();
      }
    };
    const onStartReply = () => {
      startReplied = true;
      requestInterrupt();
    };
    void issued[0].then(onStartReply, onStartReply);
    signal?.addEventListener('abort', requestInterrupt, { once: true });
    try {
      // Every answer is awaited before any failure is reported: a fence must follow the last of them, and the first
      // failure in issue order is the cause, later ones its knock-on errors.
      const results = await Promise.allSettled(issued);
      fenceDecided = true;
      const failures = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []));
      if (signal?.aborted) {
        return await this.abandon(signal, failures, interruptDelivered);
      }
      await this.throwFirstFailure(failures);
      return (results[results.length - 1] as PromiseFulfilledResult<unknown>).value;
    } finally {
      signal?.removeEventListener('abort', requestInterrupt);
    }
  }

  /**
   * Issues one command at a time, for a backend that cannot stop a running command, so that an abort takes effect
   * between commands. Returns the last one's result.
   */
  private async runOneAtATime(commands: (() => Promise<unknown>)[], signal: AbortSignal): Promise<unknown> {
    this.api.logOnce(
      'this bb backend cannot stop a running command; aborting a Chonk proof takes effect between commands',
    );
    let result: unknown;
    for (let i = 0; i < commands.length; i++) {
      if (i > 0) {
        await nextMacrotask();
      }
      if (signal.aborted) {
        return await this.abandon(signal, [], false);
      }
      try {
        result = await commands[i]();
      } catch (error) {
        if (signal.aborted) {
          return await this.abandon(signal, [error], false);
        }
        await this.throwFirstFailure([error]);
      }
    }
    return result;
  }

  /**
   * Rethrows the first failure. An interruption with no abort comes from an interrupt whose fence gave up; clearing it
   * keeps it from failing the next proof too.
   */
  private async throwFirstFailure(failures: unknown[]): Promise<void> {
    if (failures.length === 0) {
      return;
    }
    if (failures.some(isInterruption)) {
      await this.clearInterruptOnce();
    }
    throw failures[0];
  }

  /**
   * Ends an aborted proof once bb's interrupt flag is clear: rethrows the first failure that is not the interruption
   * (one that raced the abort), or rejects with the reason.
   */
  private async abandon(signal: AbortSignal, failures: unknown[], interruptDelivered: boolean): Promise<never> {
    await this.fence(interruptDelivered);
    const raced = failures.findIndex(error => !isInterruption(error));
    if (raced >= 0) {
      throw failures[raced];
    }
    if (failures.length > 0) {
      this.api.log(`Chonk proof aborted: bb answered "${INTERRUPTED_MESSAGE}"`);
    }
    throw signal.reason;
  }

  /**
   * bb answers in order, so once every command has answered, a `clearInterrupt` that reads true proves the interrupt
   * arrived and was cleared before anything issued after it. A signal can arrive after the last answer, hence the
   * repeated reads.
   */
  private async fence(interruptDelivered: boolean): Promise<void> {
    if (!interruptDelivered) {
      await this.clearInterruptOnce();
      return;
    }
    const outcome = await readUntilInterruptCleared(this.api);
    if (outcome === 'unsupported') {
      this.api.interruptNotHonoured('this bb binary does not support interrupts');
    } else if (outcome === 'deadline') {
      this.api.interruptNotHonoured(`bb did not report an interrupt within ${FENCE_DEADLINE_MS} ms`);
    }
  }

  /**
   * Releases bb's Chonk session and clears its interrupt flag. Errors are ignored: an older binary does not know the
   * command, and a dead transport leaves nothing to clear.
   */
  private async clearInterruptOnce(): Promise<void> {
    await this.api.clearInterrupt({}).catch(() => {});
  }

  async verify(proof: Uint8Array, vk: Uint8Array): Promise<boolean> {
    const result = await this.api.chonkVerify({
      proof: toChonkProof(new Decoder({ useRecords: false }).decode(proof)),
      vk,
    });
    return result.valid;
  }

  /**
   * Compress a ChonkProof using point compression and u256 encoding.
   * Reduces proof size by ~1.7x (e.g. ~60KB to ~35KB).
   *
   * @param proof - Structured ChonkProof from the bb API (e.g. from chonkProve)
   * @returns Compressed proof bytes (each element encoded as 32 bytes)
   */
  async compressProof(proof: ChonkProof): Promise<Uint8Array> {
    const result = await this.api.chonkCompressProof({ proof });
    return result.compressedProof;
  }

  /**
   * Decompress a previously compressed ChonkProof.
   * The number of public inputs is derived automatically from the compressed size.
   *
   * @param compressedProof - Compressed proof bytes from compressProof()
   * @returns Structured ChonkProof suitable for verification
   */
  async decompressProof(compressedProof: Uint8Array): Promise<ChonkProof> {
    const result = await this.api.chonkDecompressProof({ compressedProof });
    return result.proof;
  }

  /**
   * Internal verification using native ChonkProof type.
   * Avoids encode/decode cycle when called from prove().
   */
  private async verifyNative(proof: ChonkProof, vk: Uint8Array): Promise<boolean> {
    const result = await this.api.chonkVerify({
      proof,
      vk,
    });
    return result.valid;
  }

  async gates(): Promise<number[]> {
    const circuitSizes: number[] = [];
    for (let i = 0; i < this.acirBuf.length; i++) {
      const gates = await this.api.chonkStats({
        circuit: {
          name: this.circuitNames[i] || `circuit_${i}`,
          bytecode: this.acirBuf[i],
        },
        includeGatesPerOpcode: false,
      });
      circuitSizes.push(gates.circuitSize);
    }
    return circuitSizes;
  }
}

// Converts bytecode from a base64 string to a Uint8Array
function acirToUint8Array(base64EncodedBytecode: string): Uint8Array {
  const compressedByteCode = base64Decode(base64EncodedBytecode);
  return ungzip(compressedByteCode);
}

// Base64 decode using atob (works in both browser and Node.js 18+)
function base64Decode(input: string): Uint8Array {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(input), c => c.charCodeAt(0));
  } else {
    throw new Error('atob is not available. Node.js 18+ or browser required.');
  }
}

/**
 * Convert a field element (32-byte Uint8Array) to a string.
 *
 * @param field - A 32-byte field element
 * @param radix - The radix for string conversion (2-36), defaults to 10 (decimal)
 * @returns The field value as a string in the specified radix
 *
 * @example
 * const decimal = fieldToString(field);        // "12345678"
 * const hex = fieldToString(field, 16);        // "bc614e"
 */
export function fieldToString(field: Uint8Array, radix: number = 10): string {
  let result = 0n;
  for (const byte of field) {
    result <<= 8n;
    result += BigInt(byte);
  }
  return result.toString(radix);
}

/**
 * Convert an array of field elements to an array of strings.
 * Useful for passing VK fields to Noir circuits.
 *
 * @param fields - Array of 32-byte field elements
 * @param radix - The radix for string conversion (2-36), defaults to 10 (decimal)
 * @returns Array of strings in the specified radix
 *
 * @example
 * const vkAsFields = await barretenbergAPI.vkAsFields({ verificationKey: vk });
 * const vkDecimalStrings = fieldsToStrings(vkAsFields.fields);      // ["12345678", "87654321", ...]
 * const vkHexStrings = fieldsToStrings(vkAsFields.fields, 16);      // ["bc614e", "5397fb1", ...]
 */
export function fieldsToStrings(fields: Uint8Array[], radix: number = 10): string[] {
  return fields.map(field => fieldToString(field, radix));
}
