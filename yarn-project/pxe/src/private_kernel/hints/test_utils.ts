import {
  MAX_KEY_VALIDATION_REQUESTS_PER_CALL,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_CALL,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Serializable } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  ClaimedLengthArray,
  KeyValidationRequest,
  KeyValidationRequestAndSeparator,
  NoteHash,
  Nullifier,
  PrivateCircuitPublicInputs,
  PrivateKernelCircuitPublicInputs,
  type PrivateKernelSimulateOutput,
  ReadRequest,
  ScopedKeyValidationRequestAndSeparator,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedReadRequest,
} from '@aztec/stdlib/kernel';
import { PrivateLogData, ScopedPrivateLogData } from '@aztec/stdlib/kernel';
import { PrivateLog } from '@aztec/stdlib/logs';
import { PrivateCallExecutionResult } from '@aztec/stdlib/tx';
import { VerificationKeyData } from '@aztec/stdlib/vks';

const DEFAULT_CONTRACT_ADDRESS = AztecAddress.fromBigIntUnsafe(987654n);

/**
 * Builds a ClaimedLengthArray from a list of items, padding to the required size.
 */
function makeClaimed<T extends Serializable, N extends number>(items: T[], emptyFactory: { empty(): T }, maxSize: N) {
  const padded = makeTuple(maxSize, i => items[i] ?? emptyFactory.empty());
  return new ClaimedLengthArray<T, typeof maxSize>(padded, items.length);
}

/** Builder for PrivateKernelCircuitPublicInputs with fluent API for adding side effects. */
export class PrivateKernelCircuitPublicInputsBuilder {
  private noteHashes: ScopedNoteHash[] = [];
  private nullifiers: ScopedNullifier[] = [];
  private noteHashReadRequests: ScopedReadRequest[] = [];
  private nullifierReadRequests: ScopedReadRequest[] = [];
  private keyValidationRequests: ScopedKeyValidationRequestAndSeparator[] = [];
  private privateLogs: ScopedPrivateLogData[] = [];
  private nextCounter: number;

  constructor(
    private contractAddress: AztecAddress = DEFAULT_CONTRACT_ADDRESS,
    startCounter = 1,
  ) {
    this.nextCounter = startCounter;
  }

  private getCounter(sideEffectCounter?: number): number {
    if (sideEffectCounter !== undefined) {
      this.nextCounter = sideEffectCounter + 1;
      return sideEffectCounter;
    }
    return this.nextCounter++;
  }

  /** Adds a note hash to the accumulated data. Defaults are generated randomly. */
  addNoteHash(opts?: { value?: Fr; counter?: number; contractAddress?: AztecAddress }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    const addr = opts?.contractAddress ?? this.contractAddress;
    this.noteHashes.push(new NoteHash(value, counter).scope(addr));
    return this;
  }

  /** Adds a nullifier to the accumulated data. Defaults are generated randomly. */
  addNullifier(opts?: { value?: Fr; noteHash?: Fr; counter?: number; contractAddress?: AztecAddress }): this {
    const value = opts?.value ?? Fr.random();
    const noteHash = opts?.noteHash ?? Fr.ZERO;
    const counter = this.getCounter(opts?.counter);
    const addr = opts?.contractAddress ?? this.contractAddress;
    this.nullifiers.push(new Nullifier(value, noteHash, counter).scope(addr));
    return this;
  }

  /** Adds a pending note hash read request (non-empty contract address, can match a pending note hash). */
  addPendingNoteHashReadRequest(opts?: { value?: Fr; counter?: number; contractAddress?: AztecAddress }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    const addr = opts?.contractAddress ?? this.contractAddress;
    this.noteHashReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), addr));
    return this;
  }

  /** Adds a settled note hash read request (empty contract address, resolved against the note hash tree). */
  addSettledNoteHashReadRequest(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.noteHashReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), AztecAddress.ZERO));
    return this;
  }

  /** Adds a pending nullifier read request (non-empty contract address, can match a pending nullifier). */
  addPendingNullifierReadRequest(opts?: { value?: Fr; counter?: number; contractAddress?: AztecAddress }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    const addr = opts?.contractAddress ?? this.contractAddress;
    this.nullifierReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), addr));
    return this;
  }

  /** Adds a settled nullifier read request (empty contract address, resolved against the nullifier tree). */
  addSettledNullifierReadRequest(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.nullifierReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), AztecAddress.ZERO));
    return this;
  }

  /** Adds a key validation request to validation requests. */
  addKeyValidationRequest(opts?: { contractAddress?: AztecAddress }): this {
    const addr = opts?.contractAddress ?? this.contractAddress;
    this.keyValidationRequests.push(
      new ScopedKeyValidationRequestAndSeparator(
        new KeyValidationRequestAndSeparator(new KeyValidationRequest(Fr.random(), Fr.random()), Fr.random()),
        addr,
      ),
    );
    return this;
  }

  /** Adds a private log to the accumulated data. Defaults are generated randomly. */
  addPrivateLog(opts?: { noteHashCounter?: number; counter?: number; contractAddress?: AztecAddress }): this {
    const noteHashCounter = opts?.noteHashCounter ?? 0;
    const counter = this.getCounter(opts?.counter);
    const addr = opts?.contractAddress ?? this.contractAddress;
    this.privateLogs.push(
      new ScopedPrivateLogData(new PrivateLogData(PrivateLog.empty(), noteHashCounter, counter), addr),
    );
    return this;
  }

  /** Builds the PrivateKernelCircuitPublicInputs with all added side effects. */
  build(): PrivateKernelCircuitPublicInputs {
    const publicInputs = PrivateKernelCircuitPublicInputs.empty();
    publicInputs.end.noteHashes = makeClaimed(this.noteHashes, ScopedNoteHash, MAX_NOTE_HASHES_PER_TX);
    publicInputs.end.nullifiers = makeClaimed(this.nullifiers, ScopedNullifier, MAX_NULLIFIERS_PER_TX);
    publicInputs.end.privateLogs = makeClaimed(this.privateLogs, ScopedPrivateLogData, MAX_PRIVATE_LOGS_PER_TX);
    publicInputs.validationRequests.noteHashReadRequests = makeClaimed(
      this.noteHashReadRequests,
      ScopedReadRequest,
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
    );
    publicInputs.validationRequests.nullifierReadRequests = makeClaimed(
      this.nullifierReadRequests,
      ScopedReadRequest,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    );
    publicInputs.validationRequests.scopedKeyValidationRequestsAndSeparators = makeClaimed(
      this.keyValidationRequests,
      ScopedKeyValidationRequestAndSeparator,
      MAX_KEY_VALIDATION_REQUESTS_PER_TX,
    );
    return publicInputs;
  }
}

/** Builder for PrivateCircuitPublicInputs (call-level) with fluent API for adding side effects. */
export class PrivateCircuitPublicInputsBuilder {
  private noteHashes: NoteHash[] = [];
  private nullifiers: Nullifier[] = [];
  private noteHashReadRequests: ScopedReadRequest[] = [];
  private nullifierReadRequests: ScopedReadRequest[] = [];
  private keyValidationRequests: KeyValidationRequestAndSeparator[] = [];
  private privateLogs: PrivateLogData[] = [];
  private nextCounter: number;

  constructor(
    private contractAddress: AztecAddress = DEFAULT_CONTRACT_ADDRESS,
    startCounter = 1,
  ) {
    this.nextCounter = startCounter;
  }

  private getCounter(sideEffectCounter?: number): number {
    if (sideEffectCounter !== undefined) {
      this.nextCounter = sideEffectCounter + 1;
      return sideEffectCounter;
    }
    return this.nextCounter++;
  }

  /** Adds a note hash. Defaults are generated randomly. */
  addNoteHash(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.noteHashes.push(new NoteHash(value, counter));
    return this;
  }

  /** Adds a nullifier. Defaults are generated randomly. */
  addNullifier(opts?: { value?: Fr; noteHash?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const noteHash = opts?.noteHash ?? Fr.ZERO;
    const counter = this.getCounter(opts?.counter);
    this.nullifiers.push(new Nullifier(value, noteHash, counter));
    return this;
  }

  /** Adds a pending note hash read request (non-empty contract address, can match a pending note hash). */
  addPendingNoteHashReadRequest(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.noteHashReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), this.contractAddress));
    return this;
  }

  /** Adds a settled note hash read request (empty contract address, resolved against the note hash tree). */
  addSettledNoteHashReadRequest(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.noteHashReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), AztecAddress.ZERO));
    return this;
  }

  /** Adds a pending nullifier read request (non-empty contract address, can match a pending nullifier). */
  addPendingNullifierReadRequest(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.nullifierReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), this.contractAddress));
    return this;
  }

  /** Adds a settled nullifier read request (empty contract address, resolved against the nullifier tree). */
  addSettledNullifierReadRequest(opts?: { value?: Fr; counter?: number }): this {
    const value = opts?.value ?? Fr.random();
    const counter = this.getCounter(opts?.counter);
    this.nullifierReadRequests.push(new ScopedReadRequest(new ReadRequest(value, counter), AztecAddress.ZERO));
    return this;
  }

  /** Adds a key validation request. */
  addKeyValidationRequest(): this {
    this.keyValidationRequests.push(
      new KeyValidationRequestAndSeparator(new KeyValidationRequest(Fr.random(), Fr.random()), Fr.random()),
    );
    return this;
  }

  /** Adds a private log. Defaults are generated randomly. */
  addPrivateLog(opts?: { noteHashCounter?: number; counter?: number }): this {
    const noteHashCounter = opts?.noteHashCounter ?? 0;
    const counter = this.getCounter(opts?.counter);
    this.privateLogs.push(new PrivateLogData(PrivateLog.empty(), noteHashCounter, counter));
    return this;
  }

  /** Builds the PrivateCircuitPublicInputs with all added side effects. */
  build(): PrivateCircuitPublicInputs {
    const publicInputs = PrivateCircuitPublicInputs.empty();
    publicInputs.callContext.contractAddress = this.contractAddress;
    publicInputs.noteHashes = makeClaimed(this.noteHashes, NoteHash, MAX_NOTE_HASHES_PER_CALL);
    publicInputs.nullifiers = makeClaimed(this.nullifiers, Nullifier, MAX_NULLIFIERS_PER_CALL);
    publicInputs.privateLogs = makeClaimed(this.privateLogs, PrivateLogData, MAX_PRIVATE_LOGS_PER_CALL);
    publicInputs.noteHashReadRequests = makeClaimed(
      this.noteHashReadRequests,
      ScopedReadRequest,
      MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
    );
    publicInputs.nullifierReadRequests = makeClaimed(
      this.nullifierReadRequests,
      ScopedReadRequest,
      MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
    );
    publicInputs.keyValidationRequestsAndSeparators = makeClaimed(
      this.keyValidationRequests,
      KeyValidationRequestAndSeparator,
      MAX_KEY_VALIDATION_REQUESTS_PER_CALL,
    );
    return publicInputs;
  }
}

/** Wraps a PrivateKernelCircuitPublicInputs in a PrivateKernelSimulateOutput. */
export function makeKernelOutput(
  publicInputs?: PrivateKernelCircuitPublicInputs,
): PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs> {
  return {
    publicInputs: publicInputs ?? PrivateKernelCircuitPublicInputs.empty(),
    verificationKey: VerificationKeyData.empty(),
    outputWitness: new Map(),
    bytecode: Buffer.from([]),
  };
}

/** Wraps a PrivateCircuitPublicInputs in a PrivateCallExecutionResult. */
export function makeExecutionResult(publicInputs?: PrivateCircuitPublicInputs): PrivateCallExecutionResult {
  return new PrivateCallExecutionResult(
    Buffer.alloc(0),
    Buffer.alloc(0),
    new Map(),
    publicInputs ?? PrivateCircuitPublicInputs.empty(),
    [],
    new Map(),
    [],
    [],
    [],
    [],
    [],
  );
}
