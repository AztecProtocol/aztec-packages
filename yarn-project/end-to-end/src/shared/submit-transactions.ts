import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxHash, type TxReceipt, TxStatus } from '@aztec/aztec.js/tx';
import { times } from '@aztec/foundation/collection';
import type { TestWallet } from '@aztec/test-wallet/server';

// submits a set of transactions to the provided Wallet
export const submitTxsTo = async (
  wallet: TestWallet,
  submitter: AztecAddress,
  numTxs: number,
  logger: Logger,
): Promise<TxHash[]> => {
  const txHashes: TxHash[] = [];
  await Promise.all(
    times(numTxs, async () => {
      const accountManager = await wallet.createSchnorrAccount(Fr.random(), Fr.random(), GrumpkinScalar.random());
      const deployMethod = await accountManager.getDeployMethod();
      const txHash = await deployMethod.send({ from: submitter, wait: NO_WAIT });

      logger.info(`Tx sent with hash ${txHash}`);
      const receipt: TxReceipt = await wallet.getTxReceipt(txHash);
      expect(receipt.status).toBe(TxStatus.PENDING);
      logger.info(`Receipt received for ${txHash}`);
      txHashes.push(txHash);
    }),
  );
  return txHashes;
};
