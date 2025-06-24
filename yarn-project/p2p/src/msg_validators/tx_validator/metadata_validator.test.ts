import { Fr } from '@aztec/foundation/fields';
import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { AnyTx, Tx } from '@aztec/stdlib/tx';
import {
  MaxBlockNumber,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TX_ERROR_INVALID_MAX_BLOCK_NUMBER,
} from '@aztec/stdlib/tx';

import { MetadataTxValidator } from './metadata_validator.js';

describe('MetadataTxValidator', () => {
  let blockNumber: number;
  let chainId: Fr;
  let rollupVersion: Fr;
  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let maxTxExpirySlots: number;

  let seed: number = 1;
  let validator: MetadataTxValidator<AnyTx>;

  beforeEach(() => {
    chainId = new Fr(1);
    blockNumber = 42;
    rollupVersion = new Fr(2);
    vkTreeRoot = new Fr(3);
    protocolContractTreeRoot = new Fr(4);
    maxTxExpirySlots = 2400;
    validator = new MetadataTxValidator({
      l1ChainId: chainId,
      rollupVersion,
      blockNumber,
      vkTreeRoot,
      protocolContractTreeRoot,
      maxTxExpirySlots,
    });
  });

  const expectValid = async (tx: Tx) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  const makeTxs = async () => {
    const opts = { chainId, version: rollupVersion, vkTreeRoot, protocolContractTreeRoot };
    const tx1 = await mockTx(seed++, opts);
    const tx2 = await mockTxForRollup(seed++, opts);

    return [tx1, tx2];
  };

  it('allows only transactions for the right chain', async () => {
    const goodTxs = await makeTxs();
    const badTxs = await makeTxs();

    badTxs.forEach(tx => {
      tx.data.constants.txContext.chainId = chainId.add(new Fr(1));
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_L1_CHAIN_ID);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_L1_CHAIN_ID);
  });

  it('allows only transactions for the right rollup', async () => {
    const goodTxs = await makeTxs();
    const badTxs = await makeTxs();

    badTxs.forEach(tx => {
      tx.data.constants.txContext.version = rollupVersion.add(Fr.ONE);
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_ROLLUP_VERSION);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_ROLLUP_VERSION);
  });

  it('allows only transactions with the right roots', async () => {
    const goodTxs = await makeTxs();
    const badTxs = await makeTxs();

    badTxs[0].data.constants.vkTreeRoot = vkTreeRoot.add(new Fr(1));
    badTxs[1].data.constants.protocolContractTreeRoot = protocolContractTreeRoot.add(new Fr(1));

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_VK_TREE_ROOT);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT);
  });

  it.each([42, 43])('allows txs with valid max block number', async maxBlockNumber => {
    const [goodTx] = await makeTxs();
    goodTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, maxBlockNumber);

    await expectValid(goodTx);
  });

  it('rejects txs with unset max block number', async () => {
    const [badTx] = await makeTxs();
    badTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(false, 0);

    await expectInvalid(badTx, TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
  });

  it('rejects txs with lower max block number', async () => {
    const [badTx] = await makeTxs();
    badTx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, blockNumber - 1);

    await expectInvalid(badTx, TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
  });

  it('should reject tx with max block number too far in the future', async () => {
    const [tx] = await makeTxs();
    tx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, blockNumber + maxTxExpirySlots + 1);

    await expectInvalid(tx, TX_ERROR_INVALID_MAX_BLOCK_NUMBER);
  });

  it('should accept tx with max block number within expiry limit', async () => {
    const [tx] = await makeTxs();
    tx.data.rollupValidationRequests.maxBlockNumber = new MaxBlockNumber(true, blockNumber + maxTxExpirySlots);

    await expectValid(tx);
  });
});
