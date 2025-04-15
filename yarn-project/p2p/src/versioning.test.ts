import { EthAddress } from '@aztec/foundation/eth-address';
import type { ChainConfig } from '@aztec/stdlib/config';

import type { SignableENR } from '@chainsafe/enr';
import { type MockProxy, mock } from 'jest-mock-extended';

import { AZTEC_ENR_KEY } from './types/index.js';
import { checkAztecEnrVersion, setAztecEnrKey } from './versioning.js';

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
      l1Contracts: {
        rollupAddress: EthAddress.random(),
      },
      rollupVersion: 3,
    };
  });

  it.each([true, false])('sets and compares versions with xxhash=%s', (useXxHash: boolean) => {
    const versions = setAztecEnrKey(enr, chainConfig, useXxHash);
    expect(versions.l1ChainId).toEqual(1);
    expect(versions.rollupVersion).toEqual(3);
    expect(versions.l1RollupAddress).toEqual(chainConfig.l1Contracts.rollupAddress);
    expect(versionSet).toHaveLength(useXxHash ? 8 : 33);

    checkAztecEnrVersion(versionSet, versions);
    expect(() => checkAztecEnrVersion(versionSet, { ...versions, l1ChainId: 3 })).toThrow();
  });
});
