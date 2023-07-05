import { AztecNode, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, Fr, TxStatus } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { YoloContractAbi } from '@aztec/noir-contracts/examples';
import { calculateStorageSlot, setup } from './utils.js';

describe('e2e_yolo_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let contract: Contract;

  const deployContract = async () => {
    logger(`Deploying L2 public contract...`);
    const deployer = new ContractDeployer(YoloContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();

    logger(`Tx sent with hash ${await tx.getTxHash()}`);
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, YoloContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    const txReceipt = await tx.getReceipt();
    logger(`L2 contract deployed at ${receipt.contractAddress}`);
    return { contract, tx, txReceipt };
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger } = await setup());
  }, 100_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  const logInterestingStorage = async (contract: Contract, aztecNode: AztecNode) => {
    for (let j = 1; j < 3; j++) {
      const baseSlot = await calculateStorageSlot(BigInt(j), new Fr(0));
      for (let i = 0; i < 3; i++) {
        const slot = baseSlot.value + BigInt(i);
        const storageValue = await aztecNode.getStorageAt(contract.address!, slot);
        if (storageValue && !Fr.fromBuffer(storageValue).isZero()) {
          logger(`\tStorage slot ${new Fr(slot).toString()} has value ${Fr.fromBuffer(storageValue).value}`);
        }
      }
    }
  };

  it('🦍 ', async () => {
    const recipientIdx = 0;

    const recipient = accounts[recipientIdx];
    const { contract: deployedContract } = await deployContract();

    {
      logger('Initializing contract');
      const tx = deployedContract.methods.init().send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
    }

    {
      logger('Depositing 💰 -> 🏦');
      const tx = deployedContract.methods.deposit(0n, 420n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      await logInterestingStorage(deployedContract, aztecNode);
    }
    
    {
      logger('Borrow 🏦 -> 🍌');
      const tx = deployedContract.methods.borrow(0n, 69n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      await logInterestingStorage(deployedContract, aztecNode);
    }

    {
      logger('Repay: 🍌 -> 🏦');
      const tx = deployedContract.methods.repay(0n, 20n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      await logInterestingStorage(deployedContract, aztecNode);
    }

    {
      logger('Withdraw: 🏦 -> 💰');
      const tx = deployedContract.methods.withdraw(0n, 42n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      await logInterestingStorage(deployedContract, aztecNode);
    }
  }, 450_000);
});
