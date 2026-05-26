// Release-branch reproducibility gate for the standard contracts.
//
// Sibling to the freshness gate in `standard_contract_data.test.ts`: that test asserts the
// committed TS twin stays aligned with the freshly-built artifact. This test goes one level
// further and pins the *full artifact JSON* so a release branch can detect any unintended
// bytecode drift between the pinned release artifact and the current build output.
//
// TODO: enable on release branches by dropping the `.skip`. Run manually with:
//   yarn workspace @aztec/standard-contracts test src/reproducibility.test.ts
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { standardContracts } from './contract_data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = path.join(__dirname, '../../../noir-projects/noir-contracts/target');
const PINNED_DIR = path.join(__dirname, 'pinned');

describe.skip('standard contract artifact reproducibility', () => {
  it.each(standardContracts)(
    '$name pinned artifact matches the freshly-built artifact byte-for-byte',
    async ({ name, src }) => {
      const freshPath = path.join(TARGET_DIR, `${src}.json`);
      const pinnedPath = path.join(PINNED_DIR, `${name}.artifact.json`);
      const [pinned, fresh] = await Promise.all([fs.readFile(pinnedPath), fs.readFile(freshPath)]);
      const pinnedHash = createHash('sha256').update(pinned).digest('hex');
      const freshHash = createHash('sha256').update(fresh).digest('hex');
      if (pinnedHash !== freshHash) {
        throw new Error(
          `${name} pinned artifact is stale; if this drift is intentional on a release branch, copy ` +
            `${freshPath} over ${pinnedPath} and commit the result.\n` +
            `  pinned sha256 = ${pinnedHash}\n  fresh  sha256 = ${freshHash}`,
        );
      }
    },
  );
});
