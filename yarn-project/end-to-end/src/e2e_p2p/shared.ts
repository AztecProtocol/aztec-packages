import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { Fr, type Logger, ProvenTx, type SentTx, TxStatus, getContractInstanceFromDeployParams } from '@aztec/aztec.js';
import { timesAsync } from '@aztec/foundation/collection';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { PXEService, createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe/server';

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
    const tx = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic).send();
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
  rpcConfig.proverEnabled = false;
  const pxeService = await createPXEService(node, rpcConfig, { useLogSuffix: true });

  const account = await getSchnorrAccount(
    pxeService,
    fundedAccount.secret,
    fundedAccount.signingKey,
    fundedAccount.salt,
  );
  await account.register();
  const wallet = await account.getWallet();

  const txs = await submitTxsTo(pxeService, numTxs, wallet, logger);
  return { txs, pxeService, node };
};

export async function createPXEServiceAndPrepareTransactions(
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<{ pxeService: PXEService; txs: ProvenTx[]; node: AztecNodeService }> {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const pxe = await createPXEService(node, rpcConfig, { useLogSuffix: true });

  const account = await getSchnorrAccount(pxe, fundedAccount.secret, fundedAccount.signingKey, fundedAccount.salt);
  await account.register();
  const wallet = await account.getWallet();

  const testContractInstance = await getContractInstanceFromDeployParams(TestContractArtifact, {});
  await wallet.registerContract({ instance: testContractInstance, artifact: TestContractArtifact });
  const contract = await TestContract.at(testContractInstance.address, wallet);

  const txs = await timesAsync(numTxs, async () => {
    const tx = await contract.methods.emit_nullifier(Fr.random()).prove();
    const txHash = await tx.getTxHash();
    logger.info(`Tx prepared with hash ${txHash}`);
    return tx;
  });

  return { txs, pxeService: pxe, node };
}
