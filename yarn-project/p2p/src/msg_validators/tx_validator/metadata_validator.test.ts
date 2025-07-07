import { Fr } from '@aztec/foundation/fields';
import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { AnyTx, Tx } from '@aztec/stdlib/tx';
import {
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACT_TREE_ROOT,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP,
} from '@aztec/stdlib/tx';

import { MetadataTxValidator } from './metadata_validator.js';

describe('MetadataTxValidator', () => {
  let timestamp: bigint;
  let chainId: Fr;
  let rollupVersion: Fr;
  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;

  let seed = 1;

  let validator: MetadataTxValidator<AnyTx>;

  const setValidatorAtBlock = (blockNumber: number) => {
    chainId = new Fr(1);
    timestamp = 10n;
    rollupVersion = new Fr(2);
    vkTreeRoot = new Fr(3);
    protocolContractTreeRoot = new Fr(4);
    validator = new MetadataTxValidator({
      l1ChainId: chainId,
      rollupVersion,
      timestamp,
      blockNumber,
      vkTreeRoot,
      protocolContractTreeRoot,
    });
  };

  beforeEach(() => {
    setValidatorAtBlock(3);
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
    goodTx.data.includeByTimestamp = includeByTimestamp;

    await expectValid(goodTx);
  });

  it('allows txs with equal or greater expiration timestamp', async () => {
    const [goodTx1, goodTx2] = await makeTxs();
    goodTx1.data.includeByTimestamp = timestamp;
    goodTx2.data.includeByTimestamp = timestamp + 1n;

    await expectValid(goodTx1);
    await expectValid(goodTx2);
  });

  it('rejects txs with lower expiration timestamp', async () => {
    const [badTx] = await makeTxs();
    badTx.data.includeByTimestamp = timestamp - 1n;

    await expectInvalid(badTx, TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
  });

  it('accept txs with lower expiration timestamp when building block 1', async () => {
    // Since at block 1, we skip the expiration check, we expect the tx to be valid even if the expiration timestamp
    // is lower than the current timestamp. For details on why the check is disable for block 1 see the
    // `validate_include_by_timestamp` function in
    // `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    setValidatorAtBlock(1);

    const [badTx] = await makeTxs();
    badTx.data.includeByTimestamp = timestamp - 1n;

    await expectValid(badTx);
  });
});
