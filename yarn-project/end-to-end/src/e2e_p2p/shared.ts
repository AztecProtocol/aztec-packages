import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { TxStatus } from '@aztec/aztec.js';
import type { Logger, SentTx } from '@aztec/aztec.js';
import type { SpamContract } from '@aztec/noir-contracts.js/Spam';
import { createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe';

import type { NodeContext } from '../fixtures/setup_p2p_test.js';
import { submitTxsTo } from '../shared/submit-transactions.js';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (
  logger: Logger,
  spamContract: SpamContract,
  numTxs: number,
  opts: { callPublic?: boolean } = {},
) => {
  const txs: SentTx[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    const tx = spamContract.methods
      .spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic)
      .send({ skipPublicSimulation: true });
    const txHash = await tx.getTxHash();

    logger.info(`Tx sent with hash ${txHash}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger.info(`Receipt received for ${txHash}`);
    txs.push(tx);
  }
  return txs;
};

// creates an instance of the PXE and submit a given number of transactions to it.
export const createPXEServiceAndSubmitTransactions = async (
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<NodeContext> => {
  const rpcConfig = getRpcConfig();
  const pxeService = await createPXEService(node, rpcConfig, true);

  const account = await getSchnorrAccount(
    pxeService,
    fundedAccount.secret,
    fundedAccount.signingKey,
    fundedAccount.salt,
  );
  await account.register();
  const wallet = await account.getWallet();

  const txs = await submitTxsTo(pxeService, numTxs, wallet, logger);
  return {
    txs,
    pxeService,
    node,
  };
};
