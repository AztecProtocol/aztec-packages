import { AztecAddress, Fr, GrumpkinScalar, type Logger, type SentTx, TxStatus } from '@aztec/aztec.js';
import { times } from '@aztec/foundation/collection';
import type { TestWallet } from '@aztec/test-wallet/server';

// submits a set of transactions to the provided Wallet
export const submitTxsTo = async (
  wallet: TestWallet,
  submitter: AztecAddress,
  numTxs: number,
  logger: Logger,
): Promise<SentTx[]> => {
  const txs: SentTx[] = [];
  await Promise.all(
    times(numTxs, async () => {
      const accountManager = await wallet.createSchnorrAccount(Fr.random(), Fr.random(), GrumpkinScalar.random());
      const deployMethod = await accountManager.getDeployMethod();
      const tx = deployMethod.send({ from: submitter });
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
    }),
  );
  return txs;
};
