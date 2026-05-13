// Release-branch reproducibility gate for the multi_call_entrypoint contract.
//
// Symmetric to the freshness gate in `derive_multi_call_entrypoint.test.ts`: that test asserts
// the committed TS twin stays aligned with the freshly-built artifact. This test goes one level
// further and pins the *full artifact JSON* so a release branch can detect any unintended
// bytecode drift between the pinned release artifact and the current build output.
//
// TODO: enable on release branches. Run manually with:
//   yarn workspace @aztec/standard-contracts test src/multi-call-entrypoint/reproducibility.test.ts
// and then drop the `it.skip` once the release branch is cut.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = path.join(
  __dirname,
  '../../../../noir-projects/noir-contracts/target/multi_call_entrypoint_contract-MultiCallEntrypoint.json',
);
const PINNED_ARTIFACT_PATH = path.join(__dirname, 'pinned/MultiCallEntrypoint.artifact.json');

const REGEN_HINT =
  'multi_call_entrypoint pinned artifact is stale; if this drift is intentional on a release branch, copy ' +
  `${ARTIFACT_PATH} over ${PINNED_ARTIFACT_PATH} and commit the result.`;

describe('multi_call_entrypoint artifact reproducibility', () => {
  it.skip('committed pinned artifact matches the freshly-built artifact byte-for-byte', async () => {
    const [pinned, fresh] = await Promise.all([fs.readFile(PINNED_ARTIFACT_PATH), fs.readFile(ARTIFACT_PATH)]);
    const pinnedHash = createHash('sha256').update(pinned).digest('hex');
    const freshHash = createHash('sha256').update(fresh).digest('hex');
    if (pinnedHash !== freshHash) {
      throw new Error(`${REGEN_HINT}\n  pinned sha256 = ${pinnedHash}\n  fresh  sha256 = ${freshHash}`);
    }
  });
});
