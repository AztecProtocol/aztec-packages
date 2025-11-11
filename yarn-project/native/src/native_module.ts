import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { MessageReceiver } from './msgpack_channel.js';

interface NativeClassCtor {
  new (...args: unknown[]): MessageReceiver;
}

function loadNativeModule(): Record<string, NativeClassCtor> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Map Node.js platform/arch to build directory names
  const arch = process.arch === 'x64' ? 'amd64' : process.arch;
  const platform = process.platform === 'darwin' ? 'macos' : process.platform;
  const variant = `${arch}-${platform}`;

  const modulePath = join(__dirname, '..', 'build', variant, 'nodejs_module.node');

  try {
    const require = createRequire(import.meta.url);
    return require(modulePath);
  } catch (error) {
    throw new Error(
      `Failed to load native module for ${variant} from ${modulePath}. ` +
        `Supported: amd64-linux, arm64-linux, amd64-macos, arm64-macos. ` +
        `Error: ${error}`,
    );
  }
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

/**
 * AVM simulation function that takes serialized inputs and a contract provider.
 * The contract provider enables C++ to callback to TypeScript for contract data during simulation.
 * @param inputs - Msgpack-serialized AvmFastSimulationInputs buffer
 * @param contractProvider - Object with callbacks for fetching contract instances and classes
 * @param worldStateHandle - Native handle to WorldState instance
 * TODO(MW): include generate_hints bool
 * @returns Promise resolving to msgpack-serialized AvmCircuitPublicInputs buffer
 */
export const avmSimulate: (
  inputs: Buffer,
  contractProvider: ContractProvider,
  worldStateHandle: any,
) => Promise<Buffer> = nativeModule.avmSimulate as (
  inputs: Buffer,
  contractProvider: ContractProvider,
  worldStateHandle: any,
) => Promise<Buffer>;
/**
 * AVM simulation function that uses pre-collected hints from TypeScript simulation.
 * All contract data and merkle tree hints are included in the AvmCircuitInputs, so no runtime
 * callbacks to TS or WS pointer are needed.
 * @param inputs - Msgpack-serialized AvmCircuitInputs (AvmProvingInputs in C++) buffer
 * @returns Promise resolving to msgpack-serialized simulation results buffer
 */
export const avmSimulateWithHintedDbs: (inputs: Buffer) => Promise<Buffer> = nativeModule.avmSimulateWithHintedDbs as (
  inputs: Buffer,
) => Promise<Buffer>;
