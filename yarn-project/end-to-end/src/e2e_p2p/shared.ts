import { AztecNodeService } from "@aztec/aztec-node";
import { NodeContext } from "../fixtures/setup_p2p_test.js";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { DebugLogger, SentTx } from "@aztec/aztec.js";
import { TxStatus } from "@aztec/circuit-types";
import { CompleteAddress, GrumpkinScalar } from "@aztec/circuits.js";
import { Fr } from "@aztec/foundation/fields";
import { createPXEService, PXEService ,getPXEServiceConfig as getRpcConfig } from "@aztec/pxe";

  // creates an instance of the PXE and submit a given number of transactions to it.
  export const createPXEServiceAndSubmitTransactions = async (
    logger: DebugLogger,
    node: AztecNodeService,
    numTxs: number,
  ): Promise<NodeContext> => {
    const rpcConfig = getRpcConfig();
    const pxeService = await createPXEService(node, rpcConfig, true);

    const secretKey = Fr.random();
    const completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, Fr.random());
    await pxeService.registerAccount(secretKey, completeAddress.partialAddress);

    const txs = await submitTxsTo(logger, pxeService, numTxs);
    return {
      txs,
      account: completeAddress.address,
      pxeService,
      node,
    };
  };

  // submits a set of transactions to the provided Private eXecution Environment (PXE)
  const submitTxsTo = async (logger: DebugLogger, pxe: PXEService, numTxs: number) => {
    const txs: SentTx[] = [];
    for (let i = 0; i < numTxs; i++) {
      // const tx = getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random()).deploy();
      const accountManager = getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.create({
        contractAddressSalt: accountManager.salt,
        skipClassRegistration: true,
        skipPublicDeployment: true,
        universalDeploy: true,
      });
      await deployMethod.prove({});
      const tx = deployMethod.send();

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