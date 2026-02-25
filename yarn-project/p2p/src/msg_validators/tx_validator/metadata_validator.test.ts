import { Fr } from '@aztec/foundation/curves/bn254';
import { mockTx, mockTxForRollup, txWithDataOverrides } from '@aztec/stdlib/testing';
import type { AnyTx, Tx } from '@aztec/stdlib/tx';
import {
  TX_ERROR_INCORRECT_L1_CHAIN_ID,
  TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH,
  TX_ERROR_INCORRECT_ROLLUP_VERSION,
  TX_ERROR_INCORRECT_VK_TREE_ROOT,
  TxConstantData,
  TxContext,
} from '@aztec/stdlib/tx';

import { MetadataTxValidator } from './metadata_validator.js';

describe('MetadataTxValidator', () => {
  let chainId: Fr;
  let rollupVersion: Fr;
  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;

  let seed = 1;

  let validator: MetadataTxValidator<AnyTx>;

  const setValidatorAtBlock = () => {
    chainId = new Fr(1);
    rollupVersion = new Fr(2);
    vkTreeRoot = new Fr(3);
    protocolContractsHash = new Fr(4);
    validator = new MetadataTxValidator({
      l1ChainId: chainId,
      rollupVersion,
      vkTreeRoot,
      protocolContractsHash,
    });
  };

  beforeEach(() => {
    setValidatorAtBlock();
  });

  const expectValid = async (tx: Tx) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  const makeTxs = async () => {
    const opts = { chainId, version: rollupVersion, vkTreeRoot, protocolContractsHash };
    const tx1 = await mockTx(seed++, opts);
    const tx2 = await mockTxForRollup(seed++, opts);

    return [tx1, tx2];
  };

  it('allows only transactions for the right chain', async () => {
    const goodTxs = await makeTxs();
    let badTxs = await makeTxs();

    badTxs = badTxs.map(tx => {
      const wrongChainId = chainId.add(new Fr(1));
      const newTxContext = new TxContext(
        wrongChainId,
        tx.data.constants.txContext.version,
        tx.data.constants.txContext.gasSettings,
      );
      const newConstants = new TxConstantData(
        tx.data.constants.anchorBlockHeader,
        newTxContext,
        tx.data.constants.vkTreeRoot,
        tx.data.constants.protocolContractsHash,
      );
      return txWithDataOverrides(tx, { constants: newConstants });
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_L1_CHAIN_ID);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_L1_CHAIN_ID);
  });

  it('allows only transactions for the right rollup', async () => {
    const goodTxs = await makeTxs();
    let badTxs = await makeTxs();

    badTxs = badTxs.map(tx => {
      const wrongVersion = rollupVersion.add(Fr.ONE);
      const newTxContext = new TxContext(
        tx.data.constants.txContext.chainId,
        wrongVersion,
        tx.data.constants.txContext.gasSettings,
      );
      const newConstants = new TxConstantData(
        tx.data.constants.anchorBlockHeader,
        newTxContext,
        tx.data.constants.vkTreeRoot,
        tx.data.constants.protocolContractsHash,
      );
      return txWithDataOverrides(tx, { constants: newConstants });
    });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_ROLLUP_VERSION);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_ROLLUP_VERSION);
  });

  it('allows only transactions with the right roots', async () => {
    const goodTxs = await makeTxs();
    const badTxs = await makeTxs();

    const wrongVkTreeRoot = vkTreeRoot.add(new Fr(1));
    const newConstants0 = new TxConstantData(
      badTxs[0].data.constants.anchorBlockHeader,
      badTxs[0].data.constants.txContext,
      wrongVkTreeRoot,
      badTxs[0].data.constants.protocolContractsHash,
    );
    badTxs[0] = txWithDataOverrides(badTxs[0], { constants: newConstants0 });

    const wrongProtocolContractsHash = protocolContractsHash.add(new Fr(1));
    const newConstants1 = new TxConstantData(
      badTxs[1].data.constants.anchorBlockHeader,
      badTxs[1].data.constants.txContext,
      badTxs[1].data.constants.vkTreeRoot,
      wrongProtocolContractsHash,
    );
    badTxs[1] = txWithDataOverrides(badTxs[1], { constants: newConstants1 });

    await expectValid(goodTxs[0]);
    await expectValid(goodTxs[1]);
    await expectInvalid(badTxs[0], TX_ERROR_INCORRECT_VK_TREE_ROOT);
    await expectInvalid(badTxs[1], TX_ERROR_INCORRECT_PROTOCOL_CONTRACTS_HASH);
  });
});
