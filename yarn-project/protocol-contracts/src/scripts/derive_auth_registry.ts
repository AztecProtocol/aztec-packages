// CLI entry for regenerating the auth_registry committed stamp.
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
//        in the protocol-contracts test job and reproducible-build CI.
//   3. yarn-project/protocol-contracts/src/auth-registry/address.gen.ts
//      — TypeScript twin consumed by `getCanonicalAuthRegistry()` and friends.
//
// All three outputs are byte-identical for byte-identical inputs (no wall-clock or
// random salts). The CI determinism check builds twice and diffs these files.

import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  ARTIFACT_PATH,
  NR_LIB_PATH,
  NR_LOCK_PATH,
  TS_TWIN_PATH,
  deriveAuthRegistryStamp,
  hashAuthRegistrySources,
  renderLockJson,
  renderNoirLib,
  renderTsTwin,
} from '../auth-registry/derive_auth_registry.js';

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
