// Backup line of defense for the build-time drift check in `scripts/generate_data.ts`. Re-derives
// every standard contract from its freshly-built on-disk artifact and asserts both the committed
// TypeScript constants AND the committed Noir `standard_addresses.nr` twins match what the
// generator would produce right now. Both this test and the generator share `contract_data.ts`
// and `drift.ts`, so they cannot disagree on derivation, rendering, or formatting.
//
// If the artifacts haven't been built yet (running `yarn test` without a prior bootstrap), the
// content-drift suite gracefully skips with a `console.warn` — the same pattern protocol-contracts
// uses for its freshness gates.
import { promises as fs } from 'fs';
import path from 'path';

import {
  type ContractData,
  computeContractData,
  loadArtifact,
  srcArtifactsPath,
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
    await fs.access(path.join(srcArtifactsPath, `${srcName}.json`));
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
      it(`${name}: derived address and class data match committed values`, async () => {
        if (!(await artifactExists(src))) {
          console.warn(
            `Skipping drift check for ${name}: artifact \`${src}.json\` not found under ${srcArtifactsPath}. ` +
              `Run the noir-contracts build first (e.g. \`./bootstrap.sh\` from the repo root) to enable this check.`,
          );
          return;
        }

        const artifact = await loadArtifact(src);
        const derived = await computeContractData(artifact);

        const committedAddress = StandardContractAddress[name as keyof typeof StandardContractAddress];
        const committedClassId = StandardContractClassId[name as keyof typeof StandardContractClassId];
        const committedClassIdPreimage =
          StandardContractClassIdPreimage[name as keyof typeof StandardContractClassIdPreimage];
        const committedInitializationHash =
          StandardContractInitializationHash[name as keyof typeof StandardContractInitializationHash];
        const committedPrivateFunctions =
          StandardContractPrivateFunctions[name as keyof typeof StandardContractPrivateFunctions];

        expect(derived.address.toString()).toEqual(committedAddress.toString());
        expect(derived.classId.toString()).toEqual(committedClassId.toString());
        expect(derived.artifactHash.toString()).toEqual(committedClassIdPreimage.artifactHash.toString());
        expect(derived.privateFunctionsRoot.toString()).toEqual(
          committedClassIdPreimage.privateFunctionsRoot.toString(),
        );
        expect(derived.publicBytecodeCommitment.toString()).toEqual(
          committedClassIdPreimage.publicBytecodeCommitment.toString(),
        );
        expect(derived.initializationHash.toString()).toEqual(committedInitializationHash.toString());

        expect(derived.privateFunctions.length).toEqual(committedPrivateFunctions.length);
        for (let i = 0; i < derived.privateFunctions.length; i++) {
          expect(derived.privateFunctions[i].selector.toField().toString()).toEqual(
            committedPrivateFunctions[i].selector.toField().toString(),
          );
          expect(derived.privateFunctions[i].vkHash.toString()).toEqual(committedPrivateFunctions[i].vkHash.toString());
        }
      });
    }
  });

  describe('committed file content', () => {
    // Render every target once and assert per-target so an individual stale file (e.g. only one of
    // the two `standard_addresses.nr` twins drifted) shows up as its own failure rather than being
    // hidden behind another.
    let targets: { path: string; content: string }[] | null = null;
    let skipReason: string | null = null;

    beforeAll(async () => {
      if (!(await allArtifactsExist())) {
        skipReason =
          `One or more standard-contract artifacts are missing under ${srcArtifactsPath}. ` +
          `Run the noir-contracts build first (e.g. \`./bootstrap.sh\` from the repo root) to enable this check.`;
        console.warn(`Skipping standard_contract_data content drift checks: ${skipReason}`);
        return;
      }

      const names = standardContracts.map(c => c.name);
      const contractDataList: ContractData[] = [];
      for (const { src } of standardContracts) {
        contractDataList.push(await computeContractData(await loadArtifact(src)));
      }
      targets = await renderAllTargets(names, contractDataList);
    });

    it('committed standard_contract_data.ts matches re-rendered output', async () => {
      if (skipReason !== null) {
        return;
      }
      const tsTarget = targets!.find(t => t.path.endsWith('standard_contract_data.ts'));
      expect(tsTarget).toBeDefined();
      const committed = await readIfExists(tsTarget!.path);
      expect(committed).not.toBeNull();
      expect(committed).toEqual(tsTarget!.content);
    });

    it('committed standard_addresses.nr twins match re-rendered output', async () => {
      if (skipReason !== null) {
        return;
      }
      const noirTargets = targets!.filter(t => t.path.endsWith('.nr'));
      expect(noirTargets.length).toBeGreaterThan(0);
      for (const target of noirTargets) {
        const committed = await readIfExists(target.path);
        expect(committed).not.toBeNull();
        expect(committed).toEqual(target.content);
      }
    });
  });
});
