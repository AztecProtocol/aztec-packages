import {
  AztecAddress,
  AztecNode,
  CheatCodes,
  CompleteAddress,
  Contract,
  ContractDeployer,
  DebugLogger,
  EthAddress,
  Fr,
  PXE,
  TxStatus,
  Wallet,
  getContractDeploymentInfo,
  isContractDeployed,
} from '@aztec/aztec.js';
import { TestContractArtifact } from '@aztec/noir-contracts/Test';
import { TokenContractArtifact } from '@aztec/noir-contracts/Token';
import { SequencerClient } from '@aztec/sequencer-client';

import { setup } from './fixtures/utils.js';

describe('e2e_deploy_contract', () => {
  it('should deploy a contract', async () => {
    let pxe: PXE;
    let accounts: CompleteAddress[];
    let logger: DebugLogger;
    let wallet: Wallet;
    let wallets: Wallet[];
    let aztecNode: AztecNode
    let sequencer: SequencerClient | undefined;
    let teardown: () => Promise<void>;
    let cheatCodes: CheatCodes;
    
    ({
      accounts,
      cheatCodes,
      aztecNode,
      // config,
      // deployL1ContractsValues,
      logger,
      pxe,
      sequencer,
      teardown,
      wallet,
      // wallets,
    } = await setup());

    const snap = await cheatCodes.aztec.snapShot();
    console.log(hello);

    console.log(await cheatCodes.eth.blockNumber());
    console.log(await cheatCodes.aztec.blockNumber());

    const publicKey = accounts[0].publicKey;
    const salt = Fr.random();
    const deploymentData = getContractDeploymentInfo(TestContractArtifact, [], salt, publicKey);
    const deployer = new ContractDeployer(TestContractArtifact, pxe, publicKey);
    const tx = deployer.deploy().send({ contractAddressSalt: salt });
    logger(`Tx sent with hash ${await tx.getTxHash()}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger(`Receipt received and expecting contract deployment at ${receipt.contractAddress}`);
    // we pass in wallet to wait(...) because wallet is necessary to create a TS contract instance
    const receiptAfterMined = await tx.wait({ wallet });

    expect(receiptAfterMined).toEqual(
      expect.objectContaining({
        status: TxStatus.MINED,
        error: '',
        contractAddress: deploymentData.completeAddress.address,
      }),
    );
    const contractAddress = receiptAfterMined.contractAddress!;
    expect(await isContractDeployed(pxe, contractAddress)).toBe(true);
    expect(await isContractDeployed(pxe, AztecAddress.random())).toBe(false);
    
    console.log(await cheatCodes.aztec.eth.blockNumber());
    console.log(await cheatCodes.aztec.blockNumber());

    await cheatCodes.aztec.restore(snap);
  });
});
