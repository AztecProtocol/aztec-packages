// Backup line of defense for the build-time drift check in `scripts/generate_data.ts`. Re-derives
// every standard contract from its freshly-built on-disk artifact and asserts both the committed
// TypeScript constants AND the committed Noir `standard_addresses.nr` twins match what the
// generator would produce right now. Both this test and the generator share `contract_data.ts`
// and `drift.ts`, so they cannot disagree on derivation, rendering, or formatting.
//
// Requires noir-contracts to be built first; the test fails loud if artifacts are missing.
import { promises as fs } from 'fs';
import path from 'path';

import {
  type ContractData,
  NOIR_ARTIFACTS_SRC_PATH,
  computeContractData,
  loadArtifact,
  standardContracts,
} from './contract_data.js';
import { readIfExists, renderAllTargets } from './drift.js';
import {
  StandardContractAddress,
  StandardContractClassId,
  StandardContractClassIdPreimage,
  StandardContractInitializationHash,
  StandardContractPrivateFunctions,
} from './standard_contract_data.js';

async function artifactExists(srcName: string): Promise<boolean> {
  try {
    await fs.access(path.join(NOIR_ARTIFACTS_SRC_PATH, `${srcName}.json`));
    return true;
  } catch {
    return false;
  }
}

async function allArtifactsExist(): Promise<boolean> {
  for (const { src } of standardContracts) {
    if (!(await artifactExists(src))) {
      return false;
    }
  }
  return true;
}

describe('standard_contract_data drift', () => {
  describe('per-field derivation', () => {
    for (const { name, src } of standardContracts) {
      it(`${name}: all derived fields match committed values`, async () => {
        if (!(await artifactExists(src))) {
          throw new Error(
            `Artifact \`${src}.json\` not found under ${NOIR_ARTIFACTS_SRC_PATH}. ` +
              `Run \`./bootstrap.sh\` from the repo root to build noir-contracts first.`,
          );
        }

        const derived = await computeContractData(await loadArtifact(src));
        const preimage = StandardContractClassIdPreimage[name as keyof typeof StandardContractClassIdPreimage];

        // Assemble every derived field and its committed counterpart into matching objects so a
        // single `toEqual` reports all differing fields at once as a standard expected/received diff.
        const derivedValues = {
          address: derived.address.toString(),
          classId: derived.classId.toString(),
          artifactHash: derived.artifactHash.toString(),
          privateFunctionsRoot: derived.privateFunctionsRoot.toString(),
          publicBytecodeCommitment: derived.publicBytecodeCommitment.toString(),
          initializationHash: derived.initializationHash.toString(),
          privateFunctions: derived.privateFunctions.map(fn => ({
            selector: fn.selector.toField().toString(),
            vkHash: fn.vkHash.toString(),
          })),
        };
        const committedValues = {
          address: StandardContractAddress[name as keyof typeof StandardContractAddress].toString(),
          classId: StandardContractClassId[name as keyof typeof StandardContractClassId].toString(),
          artifactHash: preimage.artifactHash.toString(),
          privateFunctionsRoot: preimage.privateFunctionsRoot.toString(),
          publicBytecodeCommitment: preimage.publicBytecodeCommitment.toString(),
          initializationHash:
            StandardContractInitializationHash[name as keyof typeof StandardContractInitializationHash].toString(),
          privateFunctions: StandardContractPrivateFunctions[name as keyof typeof StandardContractPrivateFunctions].map(
            fn => ({
              selector: fn.selector.toField().toString(),
              vkHash: fn.vkHash.toString(),
            }),
          ),
        };

        expect(derivedValues).toEqual(committedValues);
      });
    }
  });

  // The per-field block above already covers every TS-side value, so we don't re-check the rendered
  // `standard_contract_data.ts` here. The Noir `standard_addresses.nr` twins are not covered there
  // (the per-field block reads only the TS exports), so verify those circuit-facing address files
  // match what the generator would render right now.
  it('committed standard_addresses.nr twins match re-rendered output', async () => {
    if (!(await allArtifactsExist())) {
      throw new Error(
        `One or more standard-contract artifacts are missing under ${NOIR_ARTIFACTS_SRC_PATH}. ` +
          `Run \`./bootstrap.sh\` from the repo root to build noir-contracts first.`,
      );
    }

    const names = standardContracts.map(c => c.name);
    const contractDataList: ContractData[] = [];
    for (const { src } of standardContracts) {
      contractDataList.push(await computeContractData(await loadArtifact(src)));
    }
    const targets = await renderAllTargets(names, contractDataList);

    const noirTargets = targets.filter(t => t.path.endsWith('.nr'));
    expect(noirTargets.length).toBeGreaterThan(0);
    for (const target of noirTargets) {
      const committed = await readIfExists(target.path);
      expect(committed).not.toBeNull();
      expect(committed).toEqual(target.content);
    }
  });
});
