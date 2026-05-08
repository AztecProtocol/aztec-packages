import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import {
  type AuthRegistryStamp,
  renderLockJson,
  renderNoirLib,
  renderTsTwin,
} from '../scripts/derive_auth_registry.js';

describe('derive_auth_registry renderers', () => {
  const stamp: AuthRegistryStamp = {
    address: AztecAddress.fromBigInt(0xfeedfaceabbabeen),
    classId: Fr.fromString('0x000000000000000000000000000000000000000000000000000000000beefcafe'),
    artifactHash: Fr.fromString('0x000000000000000000000000000000000000000000000000000000000c0ffee1'),
    srcContentHash: '0x' + 'ab'.repeat(32),
  };

  it('renders byte-identical Noir lib for the same stamp (determinism)', () => {
    expect(renderNoirLib(stamp)).toEqual(renderNoirLib(stamp));
  });

  it('renders byte-identical lock JSON for the same stamp (determinism)', () => {
    expect(renderLockJson(stamp)).toEqual(renderLockJson(stamp));
  });

  it('renders byte-identical TS twin for the same stamp (determinism)', () => {
    expect(renderTsTwin(stamp)).toEqual(renderTsTwin(stamp));
  });

  it('embeds the stamped address and class id in the Noir lib', () => {
    const lib = renderNoirLib(stamp);
    expect(lib).toContain(stamp.address.toField().toString());
    expect(lib).toContain(stamp.classId.toString());
    expect(lib).toContain('AUTH_REGISTRY_ADDRESS');
    expect(lib).toContain('AUTH_REGISTRY_CLASS_ID');
  });

  it('embeds srcContentHash in the lock JSON for the freshness gate', () => {
    const lock = JSON.parse(renderLockJson(stamp));
    expect(lock.srcContentHash).toEqual(stamp.srcContentHash);
    expect(lock.address).toEqual(stamp.address.toString());
    expect(lock.classId).toEqual(stamp.classId.toString());
  });

  it('TS twin parses as expected exports', () => {
    const ts = renderTsTwin(stamp);
    expect(ts).toContain(`AUTH_REGISTRY_ADDRESS: AztecAddress = AztecAddress.fromString('${stamp.address.toString()}')`);
    expect(ts).toContain(`AUTH_REGISTRY_CLASS_ID: Fr = Fr.fromString('${stamp.classId.toString()}')`);
  });
});
