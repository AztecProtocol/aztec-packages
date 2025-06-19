import { Fr } from '@aztec/foundation/fields';
import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { Tx } from '@aztec/stdlib/tx';
import {
  IncludeByTimestamp,
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP,
} from '@aztec/stdlib/tx';

import { MetadataTxValidator } from './metadata_validator.js';

describe('MetadataTxValidator', () => {
  const chainId = new Fr(1);
  // Timestamp against which we will validate the expiration timestamp.
  const currentTimestamp = 10n;
  const rollupVersion = new Fr(2);
  const vkTreeRoot = new Fr(3);
  const protocolContractTreeRoot = new Fr(4);
  let seed = 1;

  const validator = new MetadataTxValidator({
    l1ChainId: chainId,
    rollupVersion,
    timestamp: currentTimestamp,
    vkTreeRoot,
    protocolContractTreeRoot,
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

  it.each([10n, 11n])('allows txs with valid expiration timestamp', async includeByTimestamp => {
    const [goodTx] = await makeTxs();
    goodTx.data.rollupValidationRequests.includeByTimestamp = new IncludeByTimestamp(true, includeByTimestamp);

    await expectValid(goodTx);
  });

  it('allows txs with unset expiration timestamp', async () => {
    const [goodTx] = await makeTxs();
    goodTx.data.rollupValidationRequests.includeByTimestamp = new IncludeByTimestamp(false, 0n);

    await expectValid(goodTx);
  });

  it('rejects txs with lower expiration timestamp', async () => {
    const [badTx] = await makeTxs();
    badTx.data.rollupValidationRequests.includeByTimestamp = new IncludeByTimestamp(true, currentTimestamp - 1n);

    await expectInvalid(badTx, TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
  });
});
