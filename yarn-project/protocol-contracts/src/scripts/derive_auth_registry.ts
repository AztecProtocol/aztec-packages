// Stamp script for the auth_registry address.
//
// Reads the compiled auth_registry artifact (produced by phase 1 of
// `noir-projects/noir-contracts/bootstrap.sh`), derives its contract class id and
// canonical address (salt = Fr(1), deployer = AztecAddress::zero(), public_keys = default),
// and writes three artefacts:
//
//   1. noir-projects/aztec-nr/auth_registry_address/src/lib.nr
//      — Noir twin consumed by phase 2 of the contract build.
//   2. noir-projects/aztec-nr/auth_registry_address/lib.lock.json
//      — { address, classId, artifactHash, srcContentHash } for the freshness gate
//        in `noir-projects/noir-contracts/bootstrap.sh` and reproducible-build CI.
//   3. yarn-project/protocol-contracts/src/auth-registry/address.gen.ts
//      — TypeScript twin consumed by `getAuthRegistryAddress()` and friends.
//
// All three outputs are byte-identical for byte-identical inputs (no wall-clock or
// random salts). The CI determinism check builds twice and diffs these files.

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

const SALT = new Fr(1);
const DEPLOYER = AztecAddress.zero();

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../');
const ARTIFACT_PATH = path.join(
  REPO_ROOT,
  'noir-projects/noir-contracts/target/auth_registry_contract-AuthRegistry.json',
);
const NR_CRATE_DIR = path.join(REPO_ROOT, 'noir-projects/aztec-nr/auth_registry_address');
const NR_LIB_PATH = path.join(NR_CRATE_DIR, 'src/lib.nr');
const NR_LOCK_PATH = path.join(NR_CRATE_DIR, 'lib.lock.json');
const TS_TWIN_PATH = path.join(REPO_ROOT, 'yarn-project/protocol-contracts/src/auth-registry/address.gen.ts');
const AUTH_REGISTRY_SRC_DIR = path.join(REPO_ROOT, 'noir-projects/noir-contracts/contracts/protocol/auth_registry_contract/src');

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
  return `// GENERATED FILE - DO NOT EDIT
//
// Written by \`yarn-project/protocol-contracts/src/scripts/derive_auth_registry.ts\` after phase 1
// of \`noir-projects/noir-contracts/bootstrap.sh\` has compiled \`auth_registry_contract\`.
//
// Auth registry MUST NOT depend on this crate. The structural and bytecode-level cycle guard in
// \`noir-projects/scripts/auth_registry_cycle_guard.sh\` pins this invariant.
//
// stampKey = ${stamp.artifactHash.toString()}

use protocol_types::{address::AztecAddress, traits::FromField};

pub global AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(${stamp.address.toField().toString()});
pub global AUTH_REGISTRY_CLASS_ID: Field = ${stamp.classId.toString()};
`;
}

export function renderLockJson(stamp: AuthRegistryStamp): string {
  return (
    JSON.stringify(
      {
        _comment:
          'GENERATED FILE - DO NOT EDIT. Written by yarn-project/protocol-contracts/src/scripts/derive_auth_registry.ts.',
        address: stamp.address.toString(),
        classId: stamp.classId.toString(),
        artifactHash: stamp.artifactHash.toString(),
        srcContentHash: stamp.srcContentHash,
      },
      null,
      2,
    ) + '\n'
  );
}

export function renderTsTwin(stamp: AuthRegistryStamp): string {
  return `// GENERATED FILE - DO NOT EDIT.
// Written by \`yarn-project/protocol-contracts/src/scripts/derive_auth_registry.ts\`.
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

export const AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress.fromString('${stamp.address.toString()}');
export const AUTH_REGISTRY_CLASS_ID: Fr = Fr.fromString('${stamp.classId.toString()}');
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

async function writeIfChanged(filePath: string, content: string): Promise<void> {
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing === content) {
      return;
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

async function main() {
  const artifactRaw = await fs.readFile(ARTIFACT_PATH, 'utf8');
  const artifact = JSON.parse(artifactRaw) as NoirCompiledContract;
  const srcContentHash = await hashAuthRegistrySources();
  const stamp = await deriveAuthRegistryStamp(artifact, srcContentHash);

  await writeIfChanged(NR_LIB_PATH, renderNoirLib(stamp));
  await writeIfChanged(NR_LOCK_PATH, renderLockJson(stamp));
  await writeIfChanged(TS_TWIN_PATH, renderTsTwin(stamp));

  process.stdout.write(
    `auth_registry stamp: address=${stamp.address.toString()} classId=${stamp.classId.toString()}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
