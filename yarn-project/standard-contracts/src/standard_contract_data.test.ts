// Backup line of defense for the build-time drift check in `scripts/generate_data.ts`. Loops the
// `standardContracts[]` list, re-derives each contract's address and class data from the on-disk
// compiled artifact, and asserts the result matches the committed values in
// `standard_contract_data.ts`. Both this test and the generator share `contract_data.ts` so they
// cannot disagree on the derivation logic.
//
// If the artifacts haven't been built yet (running `yarn test` without a prior bootstrap), the
// test gracefully skips with a `console.warn` rather than failing — the same pattern protocol-
// contracts uses for its freshness gates.
import { promises as fs } from 'fs';
import path from 'path';

import { computeContractData, loadArtifact, srcArtifactsPath, standardContracts } from './contract_data.js';
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

describe('standard_contract_data drift', () => {
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
      expect(derived.privateFunctionsRoot.toString()).toEqual(committedClassIdPreimage.privateFunctionsRoot.toString());
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
