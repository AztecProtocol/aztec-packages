import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type Logger, TxStatus } from '@aztec/aztec.js';
import { Fr, GrumpkinScalar, type PXEService } from '@aztec/pxe';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitTxsTo = async (pxe: PXEService, numTxs: number, logger: Logger) => {
  const provenTxs = [];
  for (let i = 0; i < numTxs; i++) {
    const accountManager = await getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
    const deployMethod = await accountManager.getDeployMethod();
    const tx = await deployMethod.prove({
      contractAddressSalt: new Fr(accountManager.salt),
      skipClassRegistration: true,
      skipPublicDeployment: true,
      universalDeploy: true,
    });
    provenTxs.push(tx);
  }
  const sentTxs = await Promise.all(
    provenTxs.map(async provenTx => {
      const tx = provenTx.send();
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
      return tx;
    }),
  );
  return sentTxs;
};
