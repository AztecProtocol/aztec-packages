import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, Contract, Fr, Wallet } from '@aztec/aztec.js';
import { CircuitsWasm } from '@aztec/circuits.js';
import { pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import { YoloContract } from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import { calculateAztecStorageSlot, setup } from './utils.js';

describe('e2e_yolo_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let contract: Contract;

  const deployContract = async () => {
    logger(`Deploying L2 public contract...`);
    const tx = YoloContract.deploy(aztecRpcServer).send();

    logger(`Tx sent with hash ${await tx.getTxHash()}`);
    const receipt = await tx.getReceipt();
    contract = new YoloContract(receipt.contractAddress!, wallet);
    await tx.isMined(0, 0.1);
    const txReceipt = await tx.getReceipt();
    logger(`L2 contract deployed at ${receipt.contractAddress}`);
    return { contract, tx, txReceipt };
  };

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, wallet, accounts, logger } = await setup());
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  const getStorageSnapshot = async (contract: Contract, aztecNode: AztecRPC, account: Account) => {
    const storageValues: { [key: string]: any } = {};

    {
      const baseSlot = await calculateAztecStorageSlot(1n, Fr.ZERO);
      storageValues['interestAccumulator'] = Fr.fromBuffer(
        (await aztecNode.getPublicStorageAt(contract.address, baseSlot)) ?? Buffer.alloc(0),
      );
      storageValues['last_updated_ts'] = Fr.fromBuffer(
        (await aztecNode.getPublicStorageAt(contract.address!, new Fr(baseSlot.value + 1n))) ?? Buffer.alloc(0),
      );
    }

    const accountKey = await account.key();

    {
      const collateralSlot = await calculateAztecStorageSlot(2n, accountKey);
      storageValues['private_collateral'] = Fr.fromBuffer(
        (await aztecNode.getPublicStorageAt(contract.address!, collateralSlot)) ?? Buffer.alloc(0),
      );
    }

    {
      const collateralSlot = await calculateAztecStorageSlot(2n, account.address.toField());
      storageValues['public_collateral'] = Fr.fromBuffer(
        (await aztecNode.getPublicStorageAt(contract.address!, collateralSlot)) ?? Buffer.alloc(0),
      );
    }

    {
      const debtSlot = await calculateAztecStorageSlot(3n, accountKey);
      storageValues['private_debt'] = Fr.fromBuffer(
        (await aztecNode.getPublicStorageAt(contract.address!, debtSlot)) ?? Buffer.alloc(0),
      );
    }

    {
      const debtSlot = await calculateAztecStorageSlot(3n, account.address.toField());
      storageValues['public_debt'] = Fr.fromBuffer(
        (await aztecNode.getPublicStorageAt(contract.address!, debtSlot)) ?? Buffer.alloc(0),
      );
    }

    logger(`Storage values: `, storageValues);

    return storageValues;
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

  it('Full lending run-through', async () => {
    const recipientIdx = 0;

    const recipient = accounts[recipientIdx];
    const { contract: deployedContract } = await deployContract();

    const account = new Account(recipient, new Fr(42));

    const storageSnapshots: { [key: string]: { [key: string]: Fr } } = {};

    {
      logger('Initializing contract');
      const tx = deployedContract.methods.init().send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      storageSnapshots['initial'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['initial']['interestAccumulator']).toEqual(new Fr(1000000000n));
      expect(storageSnapshots['initial']['last_updated_ts'].value).toBeGreaterThan(0n);
    }

    {
      const tx = deployedContract.methods.deposit_private(account.secret, 0n, 420n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Depositing 🥸 : 💰 -> 🏦');
      storageSnapshots['private_deposit'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      // @todo The accumulator should not increase when there are no debt. But we don't have reads/writes enough right now to handle that.
      expect(storageSnapshots['private_deposit']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['initial']['interestAccumulator'].value,
      );
      expect(storageSnapshots['private_deposit']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['initial']['last_updated_ts'].value,
      );
      expect(storageSnapshots['private_deposit']['private_collateral']).toEqual(new Fr(420n));
    }

    {
      const tx = deployedContract.methods.deposit_private(0n, recipient.toField(), 420n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Depositing 🥸 on behalf of recipient: 💰 -> 🏦');
      storageSnapshots['private_deposit_on_behalf'] = await getStorageSnapshot(
        deployedContract,
        aztecRpcServer,
        account,
      );

      expect(storageSnapshots['private_deposit_on_behalf']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['private_deposit']['interestAccumulator'].value,
      );
      expect(storageSnapshots['private_deposit_on_behalf']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['private_deposit']['last_updated_ts'].value,
      );
      expect(storageSnapshots['private_deposit_on_behalf']['private_collateral']).toEqual(
        storageSnapshots['private_deposit']['private_collateral'],
      );
      expect(storageSnapshots['private_deposit_on_behalf']['public_collateral']).toEqual(new Fr(420n));
    }

    {
      const tx = deployedContract.methods.deposit_public(account.address, 211n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Depositing: 💰 -> 🏦');
      storageSnapshots['public_deposit'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['public_deposit']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['private_deposit_on_behalf']['interestAccumulator'].value,
      );
      expect(storageSnapshots['public_deposit']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['private_deposit_on_behalf']['last_updated_ts'].value,
      );
      expect(storageSnapshots['public_deposit']['private_collateral']).toEqual(
        storageSnapshots['private_deposit_on_behalf']['private_collateral'],
      );
      expect(storageSnapshots['public_deposit']['public_collateral']).toEqual(
        new Fr(storageSnapshots['private_deposit_on_behalf']['public_collateral'].value + 211n),
      );
    }

    {
      const tx = deployedContract.methods.borrow_private(account.secret, 69n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Borrow 🥸 : 🏦 -> 🍌');
      storageSnapshots['private_borrow'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['private_borrow']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['public_deposit']['interestAccumulator'].value,
      );
      expect(storageSnapshots['private_borrow']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['public_deposit']['last_updated_ts'].value,
      );
      expect(storageSnapshots['private_borrow']['private_collateral']).toEqual(
        storageSnapshots['public_deposit']['private_collateral'],
      );
      expect(storageSnapshots['private_borrow']['public_collateral']).toEqual(
        storageSnapshots['public_deposit']['public_collateral'],
      );
      expect(storageSnapshots['private_borrow']['private_debt']).toEqual(new Fr(69n));
    }

    {
      const tx = deployedContract.methods.borrow_public(69n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Borrow: 🏦 -> 🍌');
      storageSnapshots['public_borrow'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['public_borrow']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['private_borrow']['interestAccumulator'].value,
      );
      expect(storageSnapshots['public_borrow']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['private_borrow']['last_updated_ts'].value,
      );
      expect(storageSnapshots['public_borrow']['private_collateral']).toEqual(
        storageSnapshots['private_borrow']['private_collateral'],
      );
      expect(storageSnapshots['public_borrow']['public_collateral']).toEqual(
        storageSnapshots['private_borrow']['public_collateral'],
      );
      expect(storageSnapshots['public_borrow']['private_debt']).toEqual(
        storageSnapshots['private_borrow']['private_debt'],
      );
      expect(storageSnapshots['public_borrow']['public_debt']).toEqual(new Fr(69n));
    }

    {
      const tx = deployedContract.methods.repay_private(account.secret, 0n, 20n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Repay 🥸 : 🍌 -> 🏦');
      storageSnapshots['private_repay'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['private_repay']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['public_borrow']['interestAccumulator'].value,
      );
      expect(storageSnapshots['private_repay']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['public_borrow']['last_updated_ts'].value,
      );
      expect(storageSnapshots['private_repay']['private_collateral']).toEqual(
        storageSnapshots['public_borrow']['private_collateral'],
      );
      expect(storageSnapshots['private_repay']['public_collateral']).toEqual(
        storageSnapshots['public_borrow']['public_collateral'],
      );
      expect(storageSnapshots['private_repay']['private_debt'].value).toEqual(
        storageSnapshots['public_borrow']['private_debt'].value - 20n,
      );
      expect(storageSnapshots['private_repay']['public_debt']).toEqual(
        storageSnapshots['public_borrow']['public_debt'],
      );
    }

    {
      const tx = deployedContract.methods.repay_private(0n, recipient.toField(), 20n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Repay 🥸  on behalf of public: 🍌 -> 🏦');
      storageSnapshots['private_repay_on_behalf'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['private_repay_on_behalf']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['private_repay']['interestAccumulator'].value,
      );
      expect(storageSnapshots['private_repay_on_behalf']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['private_repay']['last_updated_ts'].value,
      );
      expect(storageSnapshots['private_repay_on_behalf']['private_collateral']).toEqual(
        storageSnapshots['private_repay']['private_collateral'],
      );
      expect(storageSnapshots['private_repay_on_behalf']['public_collateral']).toEqual(
        storageSnapshots['private_repay']['public_collateral'],
      );
      expect(storageSnapshots['private_repay_on_behalf']['private_debt']).toEqual(
        storageSnapshots['private_repay']['private_debt'],
      );
      expect(storageSnapshots['private_repay_on_behalf']['public_debt'].value).toEqual(
        storageSnapshots['private_repay']['public_debt'].value - 20n,
      );
    }

    {
      const tx = deployedContract.methods.repay_public(recipient.toField(), 20n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Repay: 🍌 -> 🏦');
      storageSnapshots['public_repay'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['public_repay']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['private_repay_on_behalf']['interestAccumulator'].value,
      );
      expect(storageSnapshots['public_repay']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['private_repay_on_behalf']['last_updated_ts'].value,
      );
      expect(storageSnapshots['public_repay']['private_collateral']).toEqual(
        storageSnapshots['private_repay_on_behalf']['private_collateral'],
      );
      expect(storageSnapshots['public_repay']['public_collateral']).toEqual(
        storageSnapshots['private_repay_on_behalf']['public_collateral'],
      );
      expect(storageSnapshots['public_repay']['private_debt']).toEqual(
        storageSnapshots['private_repay_on_behalf']['private_debt'],
      );
      expect(storageSnapshots['public_repay']['public_debt'].value).toEqual(
        storageSnapshots['private_repay_on_behalf']['public_debt'].value - 20n,
      );
    }

    {
      const tx = deployedContract.methods.withdraw_public(42n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Withdraw: 🏦 -> 💰');
      storageSnapshots['public_withdraw'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['public_withdraw']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['public_repay']['interestAccumulator'].value,
      );
      expect(storageSnapshots['public_withdraw']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['public_repay']['last_updated_ts'].value,
      );
      expect(storageSnapshots['public_withdraw']['private_collateral']).toEqual(
        storageSnapshots['public_repay']['private_collateral'],
      );
      expect(storageSnapshots['public_withdraw']['public_collateral'].value).toEqual(
        storageSnapshots['public_repay']['public_collateral'].value - 42n,
      );
      expect(storageSnapshots['public_withdraw']['private_debt']).toEqual(
        storageSnapshots['public_repay']['private_debt'],
      );
      expect(storageSnapshots['public_withdraw']['public_debt']).toEqual(
        storageSnapshots['public_repay']['public_debt'],
      );
    }

    {
      const tx = deployedContract.methods.withdraw_private(account.secret, 42n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger('Withdraw 🥸 : 🏦 -> 💰');
      storageSnapshots['private_withdraw'] = await getStorageSnapshot(deployedContract, aztecRpcServer, account);

      expect(storageSnapshots['private_withdraw']['interestAccumulator'].value).toBeGreaterThan(
        storageSnapshots['public_withdraw']['interestAccumulator'].value,
      );
      expect(storageSnapshots['private_withdraw']['last_updated_ts'].value).toBeGreaterThan(
        storageSnapshots['public_withdraw']['last_updated_ts'].value,
      );
      expect(storageSnapshots['private_withdraw']['private_collateral'].value).toEqual(
        storageSnapshots['public_withdraw']['private_collateral'].value - 42n,
      );
      expect(storageSnapshots['private_withdraw']['public_collateral']).toEqual(
        storageSnapshots['public_withdraw']['public_collateral'],
      );
      expect(storageSnapshots['private_withdraw']['private_debt']).toEqual(
        storageSnapshots['public_withdraw']['private_debt'],
      );
      expect(storageSnapshots['private_withdraw']['public_debt']).toEqual(
        storageSnapshots['public_withdraw']['public_debt'],
      );
    }

    {
      const tx = deployedContract.methods._deposit(recipient.toField(), 42n).send({ origin: recipient });
      await tx.isMined(0, 0.1);
      const receipt = await tx.getReceipt();
      expect(receipt.status).toBe(TxStatus.DROPPED);
      logger('Rejected call directly to internal function 🧚 ');
      storageSnapshots['attempted_internal_deposit'] = await getStorageSnapshot(
        deployedContract,
        aztecRpcServer,
        account,
      );
      expect(storageSnapshots['private_withdraw']).toEqual(storageSnapshots['attempted_internal_deposit']);
    }
  }, 450_000);
});
