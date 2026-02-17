import { findNapiBinary } from '@aztec/bb.js';
import { type LogLevel, LogLevels, type Logger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';

import { createRequire } from 'module';

import type { MessageReceiver } from './msgpack_channel.js';

interface NativeClassCtor {
  new (...args: unknown[]): MessageReceiver;
}

function loadNativeModule(): Record<string, NativeClassCtor> {
  const require = createRequire(import.meta.url);
  const napiPath = findNapiBinary();
  if (!napiPath) {
    throw new Error('NAPI binary not found for current platform.');
  }
  return require(napiPath);
}

const nativeModule: Record<string, NativeClassCtor | Function> = loadNativeModule();

export const NativeWorldState: NativeClassCtor = nativeModule.WorldState as NativeClassCtor;
export const NativeLMDBStore: NativeClassCtor = nativeModule.LMDBStore as NativeClassCtor;

/**
 * Contract provider interface for callbacks to fetch contract data.
 * These callbacks are invoked by C++ during simulation when contract data is needed.
 */
export interface ContractProvider {
  /**
   * Fetch a contract instance by address.
   * @param address - The contract address as a string (hex format)
   * @returns Promise resolving to msgpack-serialized ContractInstanceHint buffer, or undefined if not found
   */
  getContractInstance(address: string): Promise<Buffer | undefined>;
  /**
   * Fetch a contract class by class ID.
   * @param classId - The contract class ID as a string (hex format)
   * @returns Promise resolving to msgpack-serialized ContractClassHint buffer, or undefined if not found
   */
  getContractClass(classId: string): Promise<Buffer | undefined>;

  /**
   * Add contracts from deployment data.
   * @param contractDeploymentData - Msgpack-serialized ContractDeploymentData buffer
   * @returns Promise that resolves when contracts are added
   */
  addContracts(contractDeploymentData: Buffer): Promise<void>;

  /**
   * Fetch the bytecode commitment for a contract class.
   * @param classId - The contract class ID as a string (hex format)
   * @returns Promise resolving to msgpack-serialized Fr buffer, or undefined if not found
   */
  getBytecodeCommitment(classId: string): Promise<Buffer | undefined>;

  /**
   * Fetch the debug function name for a contract function.
   * @param address - The contract address as a string (hex format)
   * @param selector - The function selector as a string (hex format)
   * @returns Promise resolving to function name string, or undefined if not found
   */
  getDebugFunctionName(address: string, selector: string): Promise<string | undefined>;

  /**
   * Create a new checkpoint for the contract database state.
   * Enables rollback to current state in case of a revert.
   * @returns Promise that resolves when checkpoint is created
   */
  createCheckpoint(): Promise<void>;

  /**
   * Commit the current checkpoint, accepting its state as latest.
   * @returns Promise that resolves when checkpoint is committed
   */
  commitCheckpoint(): Promise<void>;

  /**
   * Revert the current checkpoint, discarding its state and rolling back.
   * @returns Promise that resolves when checkpoint is reverted
   */
  revertCheckpoint(): Promise<void>;
}

// Internal native functions with numeric log level
const nativeAvmSimulate = nativeModule.avmSimulate as (
  inputs: Buffer,
  contractProvider: ContractProvider,
  worldStateHandle: any,
  logLevel: number,
  logFunction?: any,
  cancellationToken?: any,
) => Promise<Buffer>;

const nativeAvmSimulateWithHintedDbs = nativeModule.avmSimulateWithHintedDbs as (
  inputs: Buffer,
  logLevel: number,
) => Promise<Buffer>;

const nativeCreateCancellationToken = nativeModule.createCancellationToken as () => any;
const nativeCancelSimulation = nativeModule.cancelSimulation as (token: any) => void;

/**
 * Cancellation token handle used to cancel C++ AVM simulation.
 * The token is created via createCancellationToken() and can be cancelled via cancelSimulation().
 * Pass it to avmSimulate to enable cancellation support.
 */
export type CancellationToken = any;

/**
 * Create a new cancellation token for C++ simulation.
 * This token can be passed to avmSimulate and later cancelled via cancelSimulation().
 * @returns A handle to a cancellation token
 */
export function createCancellationToken(): CancellationToken {
  return nativeCreateCancellationToken();
}

/**
 * Signal cancellation to a C++ simulation.
 * The simulation will stop at the next opcode or before the next WorldState write.
 * @param token - The cancellation token previously passed to avmSimulate
 */
export function cancelSimulation(token: CancellationToken): void {
  nativeCancelSimulation(token);
}

/**
 * Concurrency limiting for C++ AVM simulation to prevent libuv thread pool exhaustion.
 *
 * The C++ simulator uses NAPI BlockingCall to callback to TypeScript for contract data.
 * This blocks the libuv thread while waiting for the callback to complete. If all libuv
 * threads are blocked waiting for callbacks, no threads remain to service those callbacks,
 * causing deadlock.
 *
 * We limit concurrent simulations to UV_THREADPOOL_SIZE / 2 to ensure threads remain
 * available for callback processing.
 */
const UV_THREADPOOL_SIZE = parseInt(process.env.UV_THREADPOOL_SIZE ?? '4', 10);
const MAX_CONCURRENT_AVM_SIMULATIONS = Math.max(1, Math.floor(UV_THREADPOOL_SIZE / 2));
const avmSimulationSemaphore = new Semaphore(MAX_CONCURRENT_AVM_SIMULATIONS);

/**
 * AVM simulation function that takes serialized inputs and a contract provider.
 * The contract provider enables C++ to callback to TypeScript for contract data during simulation.
 * @param inputs - Msgpack-serialized AvmFastSimulationInputs buffer
 * @param contractProvider - Object with callbacks for fetching contract instances and classes
 * @param worldStateHandle - Native handle to WorldState instance
 * @param logLevel - Optional log level to control C++ verbosity (only used if loggerFunction is provided)
 * @param logger - Optional logger object for C++ logging callbacks
 * @param cancellationToken - Optional token to enable cancellation support
 * @returns Promise resolving to msgpack-serialized AvmCircuitPublicInputs buffer
 */
export async function avmSimulate(
  inputs: Buffer,
  contractProvider: ContractProvider,
  worldStateHandle: any,
  logLevel: LogLevel = 'info',
  logger?: Logger,
  cancellationToken?: CancellationToken,
): Promise<Buffer> {
  await avmSimulationSemaphore.acquire();

  try {
    return await nativeAvmSimulate(
      inputs,
      contractProvider,
      worldStateHandle,
      LogLevels.indexOf(logLevel),
      logger ? (level: LogLevel, msg: string) => logger[level](msg) : null,
      cancellationToken,
    );
  } finally {
    avmSimulationSemaphore.release();
  }
}

/**
 * AVM simulation function that uses pre-collected hints from TypeScript simulation.
 * All contract data and merkle tree hints are included in the AvmCircuitInputs, so no runtime
 * callbacks to TS or WS pointer are needed.
 * @param inputs - Msgpack-serialized AvmCircuitInputs (AvmProvingInputs in C++) buffer
 * @param logLevel - Log level to control C++ verbosity
 * @returns Promise resolving to msgpack-serialized simulation results buffer
 */
export async function avmSimulateWithHintedDbs(inputs: Buffer, logLevel: LogLevel = 'info'): Promise<Buffer> {
  await avmSimulationSemaphore.acquire();
  try {
    return await nativeAvmSimulateWithHintedDbs(inputs, LogLevels.indexOf(logLevel));
  } finally {
    avmSimulationSemaphore.release();
  }
}
