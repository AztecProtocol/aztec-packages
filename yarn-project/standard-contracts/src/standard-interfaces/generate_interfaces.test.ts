import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import { promises as fs } from 'node:fs';

import { ALL_INTERFACES, renderInterfaceFile } from './generate_interfaces.js';

const REGEN_HINT =
  'standard interface stubs are stale; run `yarn workspace @aztec/standard-contracts run regen:standard-interfaces` and commit the result.';

describe('standard interface stub freshness', () => {
  for (const spec of ALL_INTERFACES) {
    describe(spec.interfaceName, () => {
      let artifactExists = false;
      beforeAll(async () => {
        artifactExists = await fs
          .access(spec.artifactPath)
          .then(() => true)
          .catch(() => false);
      });

      it('on-disk .gen.nr matches the freshly-rendered output', async () => {
        if (!artifactExists) {
          // Artifact is produced by `./bootstrap.sh build` (or `nargo compile` +
          // `bb aztec_process` for the noir-contracts package). Skip with a clear message
          // rather than fail when the artifact has not been built yet — the dedicated CI
          // job that runs this test ensures the artifact is on disk before invoking jest.
          console.warn(`Skipping ${spec.interfaceName}: ${spec.artifactPath} not found.`);
          return;
        }
        const artifact = JSON.parse(await fs.readFile(spec.artifactPath, 'utf8')) as NoirCompiledContract;
        const expected = renderInterfaceFile(spec, artifact);
        const actual = await fs.readFile(spec.outputPath, 'utf8');

        if (actual !== expected) {
          throw new Error(REGEN_HINT);
        }
      });

      it('render is deterministic for the same artifact', async () => {
        if (!artifactExists) {
          return;
        }
        const artifact = JSON.parse(await fs.readFile(spec.artifactPath, 'utf8')) as NoirCompiledContract;
        expect(renderInterfaceFile(spec, artifact)).toEqual(renderInterfaceFile(spec, artifact));
      });
    });
  }
});
