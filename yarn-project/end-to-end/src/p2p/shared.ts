import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxHash } from '@aztec/aztec.js/tx';
import { timesAsync } from '@aztec/foundation/collection';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { getPXEConfig, getPXEConfig as getRpcConfig } from '@aztec/pxe/server';

import { SchnorrHardcodedKeyAccountContract } from '../fixtures/schnorr_hardcoded_account_contract.js';
import { submitTxsTo } from '../shared/submit-transactions.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { type ProvenTx, proveInteraction } from '../test-wallet/utils.js';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (
  logger: Logger,
  from: AztecAddress,
  spamContract: SpamContract,
  numTxs: number,
  opts: { callPublic?: boolean } = {},
) => {
  const txs: TxHash[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    const method = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic);
    const { txHash } = await method.send({ from, wait: NO_WAIT });
    logger.info(`Tx sent with hash ${txHash.toString()}`);
    txs.push(txHash);
  }
  return txs;
};

// creates a wallet and submit a given number of transactions through it.
export const submitTransactions = async (
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<TxHash[]> => {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const wallet = await TestWallet.create(
    node,
    // Use checkpointed chain tip to avoid anchoring on provisional blocks that the archiver can prune
    // when their slot ends without a checkpoint landing on L1.
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const contract = new SchnorrHardcodedKeyAccountContract();
  const fundedAccountManager = await wallet.createAccount({
    secret: fundedAccount.secret,
    salt: fundedAccount.salt,
    contract,
  });
  return submitTxsTo(wallet, fundedAccountManager.address, numTxs, logger);
};

export async function prepareTransactions(
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<ProvenTx[]> {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;

  const wallet = await TestWallet.create(
    node,
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const accountContract = new SchnorrHardcodedKeyAccountContract();
  const fundedAccountManager = await wallet.createAccount({
    secret: fundedAccount.secret,
    salt: fundedAccount.salt,
    contract: accountContract,
  });

  const testContractInstance = await getContractInstanceFromInstantiationParams(TestContractArtifact, {
    salt: Fr.random(),
  });
  await wallet.registerContract(testContractInstance, TestContractArtifact);
  const contract = TestContract.at(testContractInstance.address, wallet);

  return timesAsync(numTxs, async () => {
    const tx = await proveInteraction(wallet, contract.methods.emit_nullifier(Fr.random()), {
      from: fundedAccountManager.address,
    });
    logger.info(`Tx prepared with hash ${tx.getTxHash()}`);
    return tx;
  });
}
