import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/aztec.js/tx';
import { times } from '@aztec/foundation/collection';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';

import type { TestWallet } from '../test-wallet/test_wallet.js';

// submits a set of transactions to the provided Wallet
export const submitTxsTo = async (
  wallet: TestWallet,
  submitter: AztecAddress,
  numTxs: number,
  logger: Logger,
): Promise<TxHash[]> => {
  // Register (without deploying) a single TestContract instance to source cheap throwaway txs from.
  // emit_nullifier is #[noinitcheck], so it runs on a register-only instance — this avoids a full
  // account-contract deployment per tx, which is all these callers were paying for a mined/gossiped tx.
  const testContractInstance = await getContractInstanceFromInstantiationParams(TestContractArtifact, {
    salt: Fr.random(),
  });
  await wallet.registerContract(testContractInstance, TestContractArtifact);
  const contract = TestContract.at(testContractInstance.address, wallet);

  const txHashes: TxHash[] = [];
  await Promise.all(
    times(numTxs, async () => {
      const { txHash } = await contract.methods.emit_nullifier(Fr.random()).send({ from: submitter, wait: NO_WAIT });

      logger.info(`Tx sent with hash ${txHash}`);
      const receipt: TxReceipt = await wallet.getTxReceipt(txHash);
      expect(receipt.status).toBe(TxStatus.PENDING);
      logger.info(`Receipt received for ${txHash}`);
      txHashes.push(txHash);
    }),
  );
  return txHashes;
};
