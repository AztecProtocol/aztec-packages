import { EthAddress } from '@aztec/foundation/eth-address';
import type { ChainConfig } from '@aztec/stdlib/config';
import { checkCompressedComponentVersion, compressComponentVersions } from '@aztec/stdlib/versioning';

import type { SignableENR } from '@nethermindeth/enr';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AZTEC_ENR_KEY } from './types/index.js';
import { setAztecEnrKey } from './versioning.js';

describe('versioning', () => {
  let enr: MockProxy<SignableENR>;
  let chainConfig: ChainConfig;
  let versionSet: Buffer;

  beforeEach(() => {
    enr = mock<SignableENR>({
      set: (key, value) => {
        expect(key).toEqual(AZTEC_ENR_KEY);
        versionSet = Buffer.from(value);
      },
    });

    chainConfig = {
      l1ChainId: 1,
      rollupVersion: 3,
      rollupAddress: EthAddress.random(),
    };
  });

  it('sets and compares compressed versions on ENR', () => {
    const versions = setAztecEnrKey(enr, chainConfig);
    expect(versions.l1ChainId).toEqual(1);
    expect(versions.rollupVersion).toEqual(3);
    expect(versions.l1RollupAddress).toEqual(chainConfig.rollupAddress);
    expect(Buffer.from(versionSet!).toString()).toEqual(compressComponentVersions(versions));

    checkCompressedComponentVersion(Buffer.from(versionSet!).toString(), versions);
    expect(() =>
      checkCompressedComponentVersion(Buffer.from(versionSet!).toString(), { ...versions, l1ChainId: 3 }),
    ).toThrow();
  });
});
