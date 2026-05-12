// Reusable renderers and derivation helpers for the public_checks committed stamp.
//
// Consumed by:
//   - `../scripts/derive_public_checks.ts` — the CLI that writes the two committed files.
//   - `./derive_public_checks.test.ts` — the CI freshness gate that re-derives from the
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
  'noir-projects/noir-contracts/target/public_checks_contract-PublicChecks.json',
);
export const NR_CRATE_DIR = path.join(REPO_ROOT, 'noir-projects/aztec-nr/canonical_addresses');
export const NR_LIB_PATH = path.join(NR_CRATE_DIR, 'src/public_checks.nr');
export const TS_TWIN_PATH = path.join(REPO_ROOT, 'yarn-project/canonical-contracts/src/public-checks/address.gen.ts');
export const PUBLIC_CHECKS_SRC_DIR = path.join(
  REPO_ROOT,
  'noir-projects/noir-contracts/contracts/canonical/public_checks_contract/src',
);

export type PublicChecksStamp = {
  address: AztecAddress;
  classId: Fr;
  artifactHash: Fr;
  srcContentHash: string;
};

export async function derivePublicChecksStamp(
  artifact: NoirCompiledContract,
  srcContentHash: string,
): Promise<PublicChecksStamp> {
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
      `Derived public_checks address ${address.toString()} collides with the reserved protocol-contract range [1, MAX_PROTOCOL_CONTRACTS]; perturb the salt.`,
    );
  }
  return {
    address,
    classId: contractClass.id,
    artifactHash: contractClass.artifactHash,
    srcContentHash,
  };
}

export function renderNoirLib(stamp: PublicChecksStamp): string {
  // See the same note in `auth-registry/derive_auth_registry.ts`.
  return `// GENERATED FILE - DO NOT EDIT
//
// Written by \`yarn-project/canonical-contracts/src/scripts/derive_public_checks.ts\` once
// \`public_checks_contract\` has been compiled. Regenerate with
// \`yarn workspace @aztec/canonical-contracts run regen:public-checks-address\`.
//
// public_checks_contract MAY depend on this crate transitively through \`aztec-nr/aztec\`,
// but the contract's external functions MUST NOT reference its own address. The
// structural and bytecode-level cycle guard in
// \`noir-projects/scripts/public_checks_cycle_guard.sh\` pins this invariant.
//
// artifactHash    = ${stamp.artifactHash.toString()}
// srcContentHash  = ${stamp.srcContentHash}

use protocol_types::{address::AztecAddress, traits::FromField};

pub global PUBLIC_CHECKS_ADDRESS: AztecAddress = AztecAddress::from_field(
    ${stamp.address.toField().toString()},
);
`;
}

export function renderTsTwin(stamp: PublicChecksStamp): string {
  // See the same note in `auth-registry/derive_auth_registry.ts`: prettier wraps any `.ts` line
  // wider than the project's print-width on commit, so the renderer pre-wraps to match.
  return `// GENERATED FILE - DO NOT EDIT.
// Written by \`yarn-project/canonical-contracts/src/scripts/derive_public_checks.ts\`.
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const PUBLIC_CHECKS_ADDRESS: AztecAddress = AztecAddress.fromString(
  '${stamp.address.toString()}',
);
export const PUBLIC_CHECKS_CLASS_ID: Fr = Fr.fromString(
  '${stamp.classId.toString()}',
);
`;
}

export async function hashPublicChecksSources(srcDir: string = PUBLIC_CHECKS_SRC_DIR): Promise<string> {
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
