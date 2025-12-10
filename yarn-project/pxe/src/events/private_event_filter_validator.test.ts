import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { MockProxy } from 'jest-mock-extended/lib/Mock.js';

import { SyncDataProvider } from '../storage/index.js';
import { PrivateEventFilterValidator } from './private_event_filter_validator.js';

describe('PrivateEventFilterValidator', () => {
  let contractAddress: AztecAddress;
  let lastKnownBlockNumber: BlockNumber;
  let scope: AztecAddress;
  let syncDataProvider: MockProxy<SyncDataProvider>;
  let validator: PrivateEventFilterValidator;

  beforeEach(async () => {
    lastKnownBlockNumber = BlockNumber(42);
    contractAddress = await AztecAddress.random();
    scope = await AztecAddress.random();
    syncDataProvider = mock<SyncDataProvider>();
    syncDataProvider.getBlockNumber.mockResolvedValue(lastKnownBlockNumber);
    validator = new PrivateEventFilterValidator(syncDataProvider);
  });

  it('rejects empty scope', async () => {
    await expect(validator.validate({ contractAddress, fromBlock: lastKnownBlockNumber, scopes: [] })).rejects.toThrow(
      /At least one scope is required to get private events/,
    );
  });

  it('defaults to whole range', async () => {
    const dataProviderFilter = await validator.validate({ contractAddress, scopes: [scope] });
    expect(dataProviderFilter).toEqual({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: lastKnownBlockNumber + 1,
      txHash: undefined,
    });
  });

  it('toBlock defaults to lastKnownBlock + 1', async () => {
    const dataProviderFilter = await validator.validate({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
    });
    expect(dataProviderFilter).toEqual({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
    });
  });

  it('toBlock without fromBlock defaults to [INITIAL_L2_BLOCK_NUM, toBlock)', async () => {
    const dataProviderFilter = await validator.validate({
      contractAddress,
      scopes: [scope],
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
    });
    expect(dataProviderFilter).toEqual({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
    });
  });

  it('rejects fromBlock >= toBlock', async () => {
    await expect(
      validator.validate({
        contractAddress,
        scopes: [scope],
        fromBlock: lastKnownBlockNumber,
        toBlock: lastKnownBlockNumber,
      }),
    ).rejects.toThrow(/toBlock must be strictly greater than fromBlock/);

    await expect(
      validator.validate({
        contractAddress,
        scopes: [scope],
        fromBlock: lastKnownBlockNumber,
        toBlock: BlockNumber(lastKnownBlockNumber - 1),
      }),
    ).rejects.toThrow(/toBlock must be strictly greater than fromBlock/);
  });

  it('preserves txHash', async () => {
    let dataProviderFilter = await validator.validate({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
    });
    expect(dataProviderFilter).toEqual({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
    });

    const txHash = TxHash.random();
    dataProviderFilter = await validator.validate({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
      txHash,
    });
    expect(dataProviderFilter).toEqual({
      contractAddress,
      scopes: [scope],
      fromBlock: INITIAL_L2_BLOCK_NUM,
      toBlock: BlockNumber(lastKnownBlockNumber + 1),
      txHash,
    });
  });
});
