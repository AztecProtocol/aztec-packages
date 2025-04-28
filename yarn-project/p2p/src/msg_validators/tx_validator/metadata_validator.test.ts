import { Fr } from '@aztec/foundation/fields';
import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { AnyTx, Tx } from '@aztec/stdlib/tx';
import {
  MaxBlockNumber,
  TX_ERROR_INCORRECT_CHAIN_ID,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INVALID_MAX_BLOCK_NUMBER,
} from '@aztec/stdlib/tx';

import { MetadataTxValidator } from './metadata_validator.js';

describe('MetadataTxValidator', () => {
  let blockNumber: Fr;
  let chainId: Fr;
  let rollupVersion: Fr;
  let validator: MetadataTxValidator<AnyTx>;

  beforeEach(() => {
    chainId = new Fr(1);
    blockNumber = new Fr(42);
    rollupVersion = new Fr(2);
    validator = new MetadataTxValidator(chainId, rollupVersion, blockNumber);
  });

  const expectValid = async (tx: Tx) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  it('allows only transactions for the right chain', async () => {
    const goodTxs = await Promise.all([mockTx(1), mockTxForRollup(2)]);
    const badTxs = await Promise.all([mockTx(3), mockTxForRollup(4)]);

    goodTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
      tx.data.constants.txContext.version = rollupVersion;
    });

    badTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId.add(new Fr(1));
      tx.data.constants.txContext.version = rollupVersion;
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_CHAIN_ID);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_CHAIN_ID);
  });

  it('allows only transactions for the right rollup', async () => {
    const goodTxs = await Promise.all([mockTx(1), mockTxForRollup(2)]);
    const badTxs = await Promise.all([mockTx(3), mockTxForRollup(4)]);

    goodTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
      tx.data.constants.txContext.version = rollupVersion;
    });

    badTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId;
      tx.data.constants.txContext.version = rollupVersion.add(Fr.ONE);
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_ROLLUP_VERSION);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_ROLLUP_VERSION);
  });

  it.each([42, 43])('allows txs with valid max block number', async maxBlockNumber => {
    const goodTx = await mockTxForRollup(1);
    goodTx.data.constants.txContext.chainId = chainId;
    goodTx.data.constants.txContext.version = rollupVersion;
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, new Fr(maxBlockNumber));

    await expectValid(goodTx);
  });

  it('allows txs with unset max block number', async () => {
    const goodTx = await mockTxForRollup(1);
    goodTx.data.constants.txContext.chainId = chainId;
    goodTx.data.constants.txContext.version = rollupVersion;
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(false, Fr.ZERO);

    await expectValid(goodTx);
  });

  it('rejects txs with lower max block number', async () => {
    const badTx = await mockTxForRollup(1);
    badTx.data.constants.txContext.chainId = chainId;
    badTx.data.constants.txContext.version = rollupVersion;
    badTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, blockNumber.sub(new Fr(1)));

    await expectInvalid(badTx, TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
  });
});
