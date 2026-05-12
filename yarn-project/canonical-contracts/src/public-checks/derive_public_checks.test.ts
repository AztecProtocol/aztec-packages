import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import { promises as fs } from 'node:fs';

import {
  ARTIFACT_PATH,
  NR_LIB_PATH,
  type PublicChecksStamp,
  TS_TWIN_PATH,
  derivePublicChecksStamp,
  hashPublicChecksSources,
  renderNoirLib,
  renderTsTwin,
} from './derive_public_checks.js';

const REGEN_HINT =
  'public_checks stamp is stale; run `yarn workspace @aztec/canonical-contracts run regen:public-checks-address` and commit the result.';

describe('derive_public_checks renderers', () => {
  const stamp: PublicChecksStamp = {
    address: AztecAddress.fromBigInt(0xfeedfaceabbabeen),
    classId: Fr.fromString('0x000000000000000000000000000000000000000000000000000000000beefcafe'),
    artifactHash: Fr.fromString('0x000000000000000000000000000000000000000000000000000000000c0ffee1'),
    srcContentHash: '0x' + 'ab'.repeat(32),
  };

  it('renders byte-identical Noir lib for the same stamp (determinism)', () => {
    expect(renderNoirLib(stamp)).toEqual(renderNoirLib(stamp));
  });

  it('renders byte-identical TS twin for the same stamp (determinism)', () => {
    expect(renderTsTwin(stamp)).toEqual(renderTsTwin(stamp));
  });

  it('embeds the stamped address in the Noir lib', () => {
    const lib = renderNoirLib(stamp);
    expect(lib).toContain(stamp.address.toField().toString());
    expect(lib).toContain('PUBLIC_CHECKS_ADDRESS');
    expect(lib).not.toContain('PUBLIC_CHECKS_CLASS_ID');
  });

  it('embeds artifactHash and srcContentHash in the Noir lib header', () => {
    const lib = renderNoirLib(stamp);
    expect(lib).toContain(stamp.artifactHash.toString());
    expect(lib).toContain(stamp.srcContentHash);
  });

  it('TS twin parses as expected exports', () => {
    const ts = renderTsTwin(stamp);
    expect(ts).toContain(stamp.address.toString());
    expect(ts).toContain(stamp.classId.toString());
    expect(ts).toContain('PUBLIC_CHECKS_ADDRESS: AztecAddress = AztecAddress.fromString(');
    expect(ts).toContain('PUBLIC_CHECKS_CLASS_ID: Fr = Fr.fromString(');
  });
});

describe('public_checks stamp freshness', () => {
  let artifactExists = false;
  beforeAll(async () => {
    artifactExists = await fs
      .access(ARTIFACT_PATH)
      .then(() => true)
      .catch(() => false);
  });

  it('on-disk public_checks.nr / address.gen.ts match the freshly-derived stamp', async () => {
    if (!artifactExists) {
      console.warn(`Skipping freshness check: ${ARTIFACT_PATH} not found (run ./bootstrap.sh build first).`);
      return;
    }
    const artifact = JSON.parse(await fs.readFile(ARTIFACT_PATH, 'utf8')) as NoirCompiledContract;
    const srcContentHash = await hashPublicChecksSources();
    const stamp = await derivePublicChecksStamp(artifact, srcContentHash);

    const expectedLib = renderNoirLib(stamp);
    const expectedTs = renderTsTwin(stamp);

    const [actualLib, actualTs] = await Promise.all([
      fs.readFile(NR_LIB_PATH, 'utf8'),
      fs.readFile(TS_TWIN_PATH, 'utf8'),
    ]);

    if (actualLib !== expectedLib || actualTs !== expectedTs) {
      throw new Error(REGEN_HINT);
    }
  });
});
