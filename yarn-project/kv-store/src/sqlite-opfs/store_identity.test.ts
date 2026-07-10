import { EthAddress } from '@aztec/foundation/eth-address';

import { effectiveStoreName, storeIdentitySlug } from './store_identity.js';

describe('storeIdentitySlug', () => {
  it('composes chain id, rollup address and schema version', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
    expect(storeIdentitySlug({ l1ChainId: 31337, rollupAddress, schemaVersion: 12 })).toEqual(
      '31337-0x1234567890abcdef1234567890abcdef12345678-v12',
    );
  });

  it('composes the exact slug format for the zero identity', () => {
    expect(storeIdentitySlug({ l1ChainId: 0, rollupAddress: EthAddress.ZERO, schemaVersion: 0 })).toEqual(
      '0-0x0000000000000000000000000000000000000000-v0',
    );
  });

  it('normalizes the rollup address to lowercase hex', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890ABCDEF1234567890ABCDEF12345678');
    expect(storeIdentitySlug({ l1ChainId: 0, rollupAddress, schemaVersion: 1 })).toEqual(
      `0-0x1234567890abcdef1234567890abcdef12345678-v1`,
    );
  });
});

describe('effectiveStoreName', () => {
  it('joins the logical name and the slug with an underscore', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
    expect(effectiveStoreName('pxe_data', { l1ChainId: 1, rollupAddress, schemaVersion: 2 })).toEqual(
      'pxe_data_1-0x1234567890abcdef1234567890abcdef12345678-v2',
    );
  });
});
