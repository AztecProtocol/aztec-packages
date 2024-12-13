import { type AnyTx, mockTx, mockTxForRollup } from '@aztec/circuit-types';
import { Fr, MaxBlockNumber } from '@aztec/circuits.js';

import { MetadataTxValidator } from './metadata_validator.js';

describe('MetadataTxValidator', () => {
  let blockNumber: Fr;
  let chainId: Fr;
  let validator: MetadataTxValidator<AnyTx>;

  beforeEach(() => {
    chainId = new Fr(1);
    blockNumber = new Fr(42);
    validator = new MetadataTxValidator(chainId, blockNumber);
  });

  it('allows only transactions for the right chain', async () => {
    const goodTxs = [mockTx(1), mockTxForRollup(2)];
    const badTxs = [mockTx(3), mockTxForRollup(4)];

    goodTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
    });

    badTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId.add(new Fr(1));
    });

    await expect(validator.validateTxs([...goodTxs, ...badTxs])).resolves.toEqual([goodTxs, badTxs]);
  });

  it.each([42, 43])('allows txs with valid max block number', async maxBlockNumber => {
    const goodTx = mockTxForRollup(1);
    goodTx.data.constants.txContext.chainId = chainId;
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, new Fr(maxBlockNumber));

    await expect(validator.validateTxs([goodTx])).resolves.toEqual([[goodTx], []]);
  });

  it('allows txs with unset max block number', async () => {
    const goodTx = mockTxForRollup(1);
    goodTx.data.constants.txContext.chainId = chainId;
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(false, Fr.ZERO);

    await expect(validator.validateTxs([goodTx])).resolves.toEqual([[goodTx], []]);
  });

  it('rejects txs with lower max block number', async () => {
    const badTx = mockTxForRollup(1);
    badTx.data.constants.txContext.chainId = chainId;
    badTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, blockNumber.sub(new Fr(1)));
    await expect(validator.validateTxs([badTx])).resolves.toEqual([[], [badTx]]);
  });
});
