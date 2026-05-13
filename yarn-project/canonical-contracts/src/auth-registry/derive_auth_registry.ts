// Reusable renderers and derivation helpers for the auth_registry committed stamp.
//
// Consumed by:
//   - `../scripts/derive_auth_registry.ts` — the CLI that writes the two committed files.
//   - `./derive_auth_registry.test.ts` — the CI freshness gate that re-derives from the
//     freshly-built artifact and asserts byte-equality against the on-disk values.
import { Fr } from '@aztec/foundation/curves/bn254';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SALT = new Fr(1);
export const DEPLOYER = AztecAddress.zero();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../../../');
export const ARTIFACT_PATH = path.join(
  REPO_ROOT,
  'noir-projects/noir-contracts/target/auth_registry_contract-AuthRegistry.json',
);
export const NR_CRATE_DIR = path.join(REPO_ROOT, 'noir-projects/aztec-nr/canonical_addresses');
export const NR_LIB_PATH = path.join(NR_CRATE_DIR, 'src/auth_registry.nr');
export const TS_TWIN_PATH = path.join(REPO_ROOT, 'yarn-project/canonical-contracts/src/auth-registry/address.gen.ts');
export const AUTH_REGISTRY_SRC_DIR = path.join(
  REPO_ROOT,
  'noir-projects/noir-contracts/contracts/canonical/auth_registry_contract/src',
);

export type AuthRegistryStamp = {
  address: AztecAddress;
  classId: Fr;
  artifactHash: Fr;
  srcContentHash: string;
};

export async function deriveAuthRegistryStamp(
  artifact: NoirCompiledContract,
  srcContentHash: string,
): Promise<AuthRegistryStamp> {
  const loaded = loadContractArtifact(artifact);
  const contractClass = await getContractClassFromArtifact(loaded);
  const constructorArtifact = loaded.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);
  const address = await computeContractAddressFromInstance({
    version: 1 as const,
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    initializationHash,
    publicKeys: PublicKeys.default(),
    salt: SALT,
    deployer: DEPLOYER,
  });
  if (address.toBigInt() <= 11n) {
    throw new Error(
      `Derived auth_registry address ${address.toString()} collides with the reserved protocol-contract range [1, MAX_PROTOCOL_CONTRACTS]; perturb the salt.`,
    );
  }
  return {
    address,
    classId: contractClass.id,
    artifactHash: contractClass.artifactHash,
    srcContentHash,
  };
}

export function renderNoirLib(stamp: AuthRegistryStamp): string {
  // The fully-rendered `pub global ... = AztecAddress::from_field(0x...)` line is wider than
  // `nargo fmt`'s print-width, and the noir-projects bootstrap re-runs `nargo fmt --check`. The
  // renderer pre-wraps eagerly so the freshness test's byte-equality assertion survives the
  // formatter.
  return `// GENERATED FILE - DO NOT EDIT
//
// Written by \`yarn-project/canonical-contracts/src/scripts/derive_auth_registry.ts\` once
// \`auth_registry_contract\` has been compiled. Regenerate with
// \`yarn workspace @aztec/canonical-contracts run regen:auth-registry-address\`.
//
// artifactHash    = ${stamp.artifactHash.toString()}
// srcContentHash  = ${stamp.srcContentHash}

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    ${stamp.address.toField().toString()},
);
`;
}

export function renderTsTwin(stamp: AuthRegistryStamp): string {
  // The fully-rendered `AztecAddress.fromString('0x...')` line is wider than the project's prettier
  // print-width (120), and the pre-commit hook re-wraps any inline `.ts` file. The renderer matches
  // that wrap eagerly so the freshness test's byte-equality assertion survives the formatter.
  return `// GENERATED FILE - DO NOT EDIT.
// Written by \`yarn-project/canonical-contracts/src/scripts/derive_auth_registry.ts\`.
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress.fromString(
  '${stamp.address.toString()}',
);
export const AUTH_REGISTRY_CLASS_ID: Fr = Fr.fromString(
  '${stamp.classId.toString()}',
);
`;
}

export async function hashAuthRegistrySources(srcDir: string = AUTH_REGISTRY_SRC_DIR): Promise<string> {
  const files: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        files.push(full);
      }
    }
  }
  await walk(srcDir);
  const hasher = createHash('sha256');
  for (const file of files) {
    hasher.update(path.relative(srcDir, file));
    hasher.update('\0');
    hasher.update(await fs.readFile(file));
    hasher.update('\0');
  }
  return '0x' + hasher.digest('hex');
}
