import { type Circuit, type FieldsAndBinary } from './types.js';

export * from './types.js';

/**
 * Common commands exposed by native bb CLI, used for key generation, proving, verifying, etc.
 */
export interface BarretenbergCmds {
  getProvingKey(circuit: Circuit): Promise<{ pk: FieldsAndBinary }>;

  getVerificationKey(circuit: Circuit): Promise<{ vk: FieldsAndBinary }>;

  prove(circuit: Circuit, witness: Buffer): Promise<{ proof: FieldsAndBinary; vk: FieldsAndBinary }>;

  proveAVM(circuit: Circuit): Promise<{ proof: FieldsAndBinary; vk: FieldsAndBinary }>;

  verify(proof: Buffer, vk: Buffer): Promise<boolean>;

  verifyAVM(proof: Buffer, vk: Buffer): Promise<boolean>;

  getProvingKeyAsFields(pk: Buffer): Promise<{ pk: FieldsAndBinary }>;

  getVerificationKeyAsFields(vk: Buffer): Promise<{ vk: FieldsAndBinary }>;

  generateContract(vk: Buffer): Promise<{ contract: FieldsAndBinary }>;
}

export async function getBarretenbergCmds() {
  // TODO: Nicer logic for choosing between native CLI and WASM
  if (process.env.BB_NATIVE_CLI && process.env.BB_WORKING_DIRECTORY) {
    return new (await import('../barretenberg_native_cli/index.js')).BarretenbergNativeCLI(
      process.env.BB_NATIVE_CLI,
      process.env.BB_WORKING_DIRECTORY,
      console.error,
    );
  } else {
    return new (await import('../barretenberg_cmds_wasm/index.js')).BarretenbergCmdsWasm();
  }
}
