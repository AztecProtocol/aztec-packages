import { AztecNode, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, Fr, TxStatus } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { YoloContractAbi } from '@aztec/noir-contracts/examples';
import { calculateAztecStorageSlot, setup } from './utils.js';
import { pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { CircuitsWasm } from '@aztec/circuits.js';

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

  const logInterestingStorage = async (contract: Contract, aztecNode: AztecNode, account: Account) => {
    // The tot slots
    {
      const baseSlot = await calculateAztecStorageSlot(1n, Fr.ZERO);
      for (let i = 0; i < 2; i++) {
        const slot = baseSlot.value + BigInt(i);
        const storageValue = await aztecNode.getStorageAt(contract.address!, slot);
        if (storageValue && !Fr.fromBuffer(storageValue).isZero()) {
          logger(`\tTot Storage slot ${i} has value ${Fr.fromBuffer(storageValue).value}`);
        }
      }
    }

    const accountKey = await account.key();

    {
      const collateralSlot = await calculateAztecStorageSlot(2n, accountKey);
      const storageValue = await aztecNode.getStorageAt(contract.address!, collateralSlot.value);
      if (storageValue && !Fr.fromBuffer(storageValue).isZero()) {
        logger(`\t🥸 Collateral value ${Fr.fromBuffer(storageValue).value}`);
      }
    }

    {
      const collateralSlot = await calculateAztecStorageSlot(2n, account.address.toField());
      const storageValue = await aztecNode.getStorageAt(contract.address!, collateralSlot.value);
      if (storageValue && !Fr.fromBuffer(storageValue).isZero()) {
        logger(`\tCollateral has value ${Fr.fromBuffer(storageValue).value}`);
      }
    }

    {
      const debtSlot = await calculateAztecStorageSlot(3n, accountKey);
      const storageValue = await aztecNode.getStorageAt(contract.address!, debtSlot.value);
      if (storageValue && !Fr.fromBuffer(storageValue).isZero()) {
        logger(`\t🥸 Debt has value ${Fr.fromBuffer(storageValue).value}`);
      }
    }

    {
      const debtSlot = await calculateAztecStorageSlot(3n, account.address.toField());
      const storageValue = await aztecNode.getStorageAt(contract.address!, debtSlot.value);
      if (storageValue && !Fr.fromBuffer(storageValue).isZero()) {
        logger(`\tDebt has value ${Fr.fromBuffer(storageValue).value}`);
      }
    }
  };

  class Account {
    public readonly address: AztecAddress;
    public readonly secret: Fr;

    constructor(address: AztecAddress, secret: Fr) {
      this.address = address;
      this.secret = secret;
    }

    public async key(): Promise<Fr> {
      return Fr.fromBuffer(
        pedersenPlookupCommitInputs(
          await CircuitsWasm.get(),
          [this.address, this.secret].map(f => f.toBuffer()),
        ),
      );
    }
  }

  it('🦍 ', async () => {
    const recipientIdx = 0;

    const recipient = accounts[recipientIdx];
    const { contract: deployedContract } = await deployContract();

    const account = new Account(recipient, new Fr(42));

    {
      logger('Initializing contract');
      const tx = deployedContract.methods.init().send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
    }

    {
      const tx = deployedContract.methods.deposit_private(account.secret, 0n, 420n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Depositing 🥸 : 💰 -> 🏦');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.deposit_private(0n, recipient.toField(), 420n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.deposit_public(account.address, 211n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Depositing: 💰 -> 🏦');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.borrow_private(account.secret, 69n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Borrow 🥸 : 🏦 -> 🍌');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.borrow_public(69n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Borrow: 🏦 -> 🍌');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.repay_private(account.secret, 0n, 20n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Repay 🥸 : 🍌 -> 🏦');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.repay_private(0n, recipient.toField(), 20n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Repay 🥸  on behalf of public: 🍌 -> 🏦');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.repay_public(recipient.toField(), 20n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Repay: 🍌 -> 🏦');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.withdraw_public(42n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Withdraw: 🏦 -> 💰');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }

    {
      const tx = deployedContract.methods.withdraw_private(account.secret, 42n).send({ from: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Withdraw 🥸 : 🏦 -> 💰');
      await logInterestingStorage(deployedContract, aztecNode, account);
    }
  }, 450_000);
});
