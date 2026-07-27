// Shared core for the standard-contracts data generator (`scripts/generate_data.ts`) and its
// drift-detection test (`standard_contract_data.test.ts`). Keeping the `standardContracts[]`
// list, paths, and the `computeContractData` derivation in one module ensures the generator
// (which writes the data) and the test (which checks the committed data is fresh) run the exact
// same code path. Adding a new standard contract is a one-row change in the array below — both
// the generator and the drift test pick it up automatically.
//
// The rendering and write-if-changed plumbing lives in `drift.ts`, a build-time-only sibling
// module — keeping `prettier` out of this module avoids pulling a formatter into the published
// package's transitive imports.
//
// Paths below are relative to `yarn-project/standard-contracts` (the cwd when scripts run).
import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import { promises as fs } from 'fs';
import path from 'path';

/** Root of the noir-contracts package relative to `yarn-project/standard-contracts`. */
export const NOIR_CONTRACTS_ROOT = '../../noir-projects/labs/noir-contracts';
/** Directory holding the freshly-compiled Noir artifacts the generator reads from. */
export const NOIR_ARTIFACTS_SRC_PATH = path.join(NOIR_CONTRACTS_ROOT, './target');
/** Output directory inside this package where the trimmed artifacts get copied. */
export const STANDARD_ARTIFACTS_DEST_DIR = './artifacts';
/** Path of the generated TS data file (addresses, class IDs, etc.). */
export const STANDARD_CONTRACT_DATA_OUTPUT_PATH = './src/standard_contract_data.ts';
// The `aztec` crate in aztec-nr needs a twin of the generated addresses module stamped into its
// source so circuits can reference standard-contract addresses at compile time (e.g. authwit and
// public_checks) without re-hashing at runtime.
export const NOIR_STANDARD_ADDRESSES_PATHS = ['../../noir-projects/labs/aztec-nr/aztec/src/standard_addresses.nr'];

/** The deployment salt baked into every standard contract instance. */
export const STANDARD_CONTRACT_SALT = new Fr(1);
/** Every standard contract is deployed by the zero address (universal deploy). */
export const STANDARD_CONTRACT_DEPLOYER = AztecAddress.zero();

/**
 * Single source of truth for which contracts are "standard" (non-protocol, but with deterministic
 * addresses baked into circuits via `standard_addresses.nr`).
 *
 * - `name`: TS-side name used as the key in the generated `StandardContractAddress` map.
 * - `src`: artifact filename (without `.json`) inside `noir-contracts/target/`.
 * - `nrConst`: Noir-side constant to emit in `standard_addresses.nr`, or `null` to skip the Noir
 *    stamp (used for account-side entrypoints with no Noir consumer).
 *
 * Adding a new standard contract is a one-row change here. The drift-detection check in the
 * generator and the backup jest test both iterate this list, so coverage is automatic.
 */
export const standardContracts: { name: string; src: string; nrConst: string | null }[] = [
  { name: 'AuthRegistry', src: 'auth_registry_contract-AuthRegistry', nrConst: 'STANDARD_AUTH_REGISTRY_ADDRESS' },
  {
    name: 'MultiCallEntrypoint',
    src: 'multi_call_entrypoint_contract-MultiCallEntrypoint',
    nrConst: 'STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS',
  },
  { name: 'PublicChecks', src: 'public_checks_contract-PublicChecks', nrConst: 'STANDARD_PUBLIC_CHECKS_ADDRESS' },
  {
    name: 'HandshakeRegistry',
    src: 'handshake_registry_contract-HandshakeRegistry',
    nrConst: 'STANDARD_HANDSHAKE_REGISTRY_ADDRESS',
  },
];

/** Everything derived from a compiled standard-contract artifact that the generator emits. */
export type ContractData = {
  address: AztecAddress;
  classId: Fr;
  artifactHash: Fr;
  privateFunctionsRoot: Fr;
  publicBytecodeCommitment: Fr;
  initializationHash: Fr;
  privateFunctions: { selector: FunctionSelector; vkHash: Fr }[];
};

/**
 * Loads a compiled Noir contract artifact from `noir-contracts/target/` by its source name.
 * Throws with `ENOENT` if the artifact isn't built yet — callers may catch this to provide a
 * friendlier "run the build first" message.
 */
export async function loadArtifact(srcName: string): Promise<NoirCompiledContract> {
  const src = path.join(NOIR_ARTIFACTS_SRC_PATH, `${srcName}.json`);
  return JSON.parse(await fs.readFile(src, 'utf8')) as NoirCompiledContract;
}

/**
 * Derives the address, class ID, and other deployment data for a standard contract from its
 * compiled artifact. Used by both the generator (to write `standard_contract_data.ts`) and the
 * drift test (to verify the committed data matches).
 *
 * Standard contracts come from a trusted source (the build pipeline), so no class verifications
 * are performed.
 */
export async function computeContractData(artifact: NoirCompiledContract): Promise<ContractData> {
  const loaded = loadContractArtifact(artifact);
  const contractClass = await getContractClassFromArtifact(loaded);
  const constructorArtifact = loaded.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);
  const instance = {
    version: 2 as const,
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    initializationHash,
    immutablesHash: Fr.ZERO,
    publicKeys: PublicKeys.default(),
    salt: STANDARD_CONTRACT_SALT,
    deployer: STANDARD_CONTRACT_DEPLOYER,
  };
  const address = await computeContractAddressFromInstance(instance);
  return {
    address,
    classId: contractClass.id,
    artifactHash: contractClass.artifactHash,
    privateFunctionsRoot: contractClass.privateFunctionsRoot,
    publicBytecodeCommitment: contractClass.publicBytecodeCommitment,
    initializationHash,
    privateFunctions: contractClass.privateFunctions,
  };
}
