import { AcvmService, type ExecutionFailure, type WitnessEntry } from '@aztec/acvm-sim';
import { type Logger, type LoggerBindings, resolveLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ExecutionError, ForeignCallHandler } from '@aztec/noir-acvm_js';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import type { ACIRCallback, ACIRExecutionResult } from './acvm/acvm.js';
import type { ACVMWitness } from './acvm/acvm_types.js';
import type { CircuitSimulator } from './circuit_simulator.js';

export enum ACVM_RESULT {
  SUCCESS,
  FAILURE,
}

export type ACVMSuccess = {
  status: ACVM_RESULT.SUCCESS;
  duration: number;
  witness: Map<number, string>;
  /**
   * The solved witness serialized as an acir `WitnessStack`, ready to hand to bb's `generateProof`
   * without any (de)compression. Only produced by the native {@link AcvmSimulator}; the wasm simulator
   * leaves it undefined.
   */
  witnessStack?: Uint8Array;
};

export type ACVMFailure = {
  status: ACVM_RESULT.FAILURE;
  reason: string;
};

export type ACVMResult = ACVMSuccess | ACVMFailure;

/** A field element as a 0x-prefixed 32-byte big-endian hex string, the {@link ACVMWitness} value form. */
function fieldToHex(value: Uint8Array): string {
  return '0x' + Buffer.from(value).toString('hex');
}

/** Parse an {@link ACVMWitness} hex value into a 32-byte big-endian field element. */
function hexToField(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean.padStart(64, '0'), 'hex'));
}

/** Rebuild an acvm_js-shaped {@link ExecutionError} from the service's structured failure. */
function toExecutionError(failure: ExecutionFailure): ExecutionError {
  const error = new Error(failure.message) as ExecutionError;
  if (failure.callStack) {
    error.callStack = failure.callStack;
  }
  if (failure.rawAssertionPayload) {
    error.rawAssertionPayload = failure.rawAssertionPayload;
  }
  if (failure.acirFunctionId !== null) {
    error.acirFunctionId = failure.acirFunctionId;
  }
  if (failure.brilligFunctionId !== null) {
    error.brilligFunctionId = failure.brilligFunctionId;
  }
  return error;
}

/**
 * Runs ACIR circuits by driving the out-of-process `@aztec/acvm-sim` service over IPC, replacing the
 * per-circuit `acvm` CLI spawn. One service process is spawned per simulator (via {@link create}) and
 * reused across circuits, so callers should keep an instance alive and {@link destroy} it on teardown.
 *
 * Protocol circuits only for now: it makes no foreign calls (native has no oracle resolver), matching
 * the previous native simulator's contract.
 */
export class AcvmSimulator implements CircuitSimulator {
  private logger: Logger;

  private constructor(
    private service: AcvmService,
    loggerOrBindings?: Logger | LoggerBindings,
  ) {
    this.logger = resolveLogger('simulator:acvm', loggerOrBindings);
  }

  /**
   * Spawn the acvm-sim service process and return a simulator bound to it. The `@aztec/acvm-sim`
   * package resolves its own bundled binary — no path needs to be plumbed through config.
   */
  static async create(loggerOrBindings?: Logger | LoggerBindings): Promise<AcvmSimulator> {
    const logger = resolveLogger('simulator:acvm', loggerOrBindings);
    const service = await AcvmService.spawn({ logger: (msg: string) => logger.debug(msg) });
    return new AcvmSimulator(service, loggerOrBindings);
  }

  async executeProtocolCircuit(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler | undefined,
  ): Promise<ACVMSuccess> {
    if (callback) {
      throw new Error('AcvmSimulator does not support foreign calls for protocol circuits. Ignoring callback.');
    }

    const initialWitness: WitnessEntry[] = [];
    input.forEach((value: string, index: number) => initialWitness.push({ index, value: hexToField(value) }));

    // The artifact bytecode is base64(gzipped acir Program); the service's Program::deserialize_program
    // ungzips, so it takes the base64-decoded bytes as-is.
    const bytecode = Uint8Array.from(Buffer.from(artifact.bytecode, 'base64'));

    const timer = new Timer();
    const response = await this.service.executeProgram({ bytecode, initialWitness });
    const duration = timer.ms();

    if (response.failure) {
      throw toExecutionError(response.failure);
    }

    const witness = new Map<number, string>();
    for (const entry of response.witness) {
      witness.set(entry.index, fieldToHex(entry.value));
    }

    return { status: ACVM_RESULT.SUCCESS, witness, witnessStack: response.witnessStack, duration };
  }

  executeUserCircuit(
    _input: ACVMWitness,
    _artifact: FunctionArtifactWithContractName,
    _callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    throw new Error('AcvmSimulator does not support user circuits (no oracle resolver configured).');
  }

  /** Terminate the underlying acvm-sim service process. */
  async destroy(): Promise<void> {
    await this.service.destroy();
  }
}
