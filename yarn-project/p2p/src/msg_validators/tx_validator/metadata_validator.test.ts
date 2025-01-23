import { type AnyTx, type Tx, mockTx, mockTxForRollup } from '@aztec/circuit-types';
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

  const expectValid = async (tx: Tx) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  it('allows only transactions for the right chain', async () => {
    const goodTxs = [mockTx(1), mockTxForRollup(2)];
    const badTxs = [mockTx(3), mockTxForRollup(4)];

    goodTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
    });

    badTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId.add(new Fr(1));
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], 'Incorrect chain id');
    await expectInvalid(badTxs[1], 'Incorrect chain id');
  });

  it.each([42, 43])('allows txs with valid max block number', async maxBlockNumber => {
    const goodTx = mockTxForRollup(1);
    goodTx.data.constants.txContext.chainId = chainId;
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, new Fr(maxBlockNumber));

    await expectValid(goodTx);
  });

  it('allows txs with unset max block number', async () => {
    const goodTx = mockTxForRollup(1);
    goodTx.data.constants.txContext.chainId = chainId;
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(false, Fr.ZERO);

    await expectValid(goodTx);
  });

  it('rejects txs with lower max block number', async () => {
    const badTx = mockTxForRollup(1);
    badTx.data.constants.txContext.chainId = chainId;
    badTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, blockNumber.sub(new Fr(1)));

    await expectInvalid(badTx, 'Invalid block number');
  });
});
