import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { Fr, GrumpkinScalar, TxStatus } from '@aztec/aztec.js';
import type { Logger, SentTx, Wallet } from '@aztec/aztec.js';
import type { PXEService } from '@aztec/pxe';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitTxsTo = async (
  pxe: PXEService,
  numTxs: number,
  wallet: Wallet,
  logger: Logger,
): Promise<SentTx[]> => {
  const txs: SentTx[] = [];
  for (let i = 0; i < numTxs; i++) {
    const accountManager = await getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
    const tx = accountManager.deploy({ deployWallet: wallet });
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
