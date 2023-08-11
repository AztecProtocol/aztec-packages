import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, Contract, Fr, Wallet } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { PrivateTokenAirdropContract } from '@aztec/noir-contracts/types';
import { MultiTransferContract } from '@aztec/noir-contracts/types';
import { AztecRPC } from '@aztec/types';

import { expectsNumOfEncryptedLogsInTheLastBlockToBe, setup } from './fixtures/utils.js';

describe('multi-transfer payments', () => {
  const numberOfAccounts = 6;

  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;
  let accounts: AztecAddress[];
  let logger: DebugLogger;
  let ownerAddress: AztecAddress;
  const recipients: AztecAddress[] = [];

  let zkTokenContract: PrivateTokenAirdropContract;
  let multiTransferContract: MultiTransferContract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, logger, wallet } = await setup(numberOfAccounts + 1)); // 1st being the `owner`
    ownerAddress = accounts[0];

    for (let i = 1; i < accounts.length; i++) {
      const account = accounts[i];
      recipients.push(account);
    }
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  }, 30_000);

  const deployZkTokenContract = async (initialBalance: bigint, owner: AztecAddress) => {
    logger(`Deploying zk token contract...`);
    zkTokenContract = await PrivateTokenAirdropContract.deploy(wallet, initialBalance, owner).send().deployed();
    logger(`zk token contract deployed at ${zkTokenContract.address}`);
  };

  const deployMultiTransferContract = async () => {
    logger(`Deploying multi-transfer contract...`);
    multiTransferContract = await MultiTransferContract.deploy(wallet).send().deployed();
    logger(`multi-transfer contract deployed at ${multiTransferContract.address}`);
  };

  const expectBalance = async (tokenContract: Contract, owner: AztecAddress, expectedBalance: bigint) => {
    const [balance] = await tokenContract.methods.getBalance(owner).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  it('12 transfers per transactions should work', async () => {
    const initialNote = 1000n;

    logger(`Deploying zk token contract...`);
    await deployZkTokenContract(initialNote, ownerAddress);

    logger(`Deploying multi-transfer contract...`);
    await deployMultiTransferContract();

    // owner: 1000 => [100, 200, 300, 400]
    logger(`self batchTransfer()`);
    const batchTransferTx = zkTokenContract.methods
      .batchTransfer(ownerAddress, [200n, 300n, 400n], [ownerAddress, ownerAddress, ownerAddress], 0, 0)
      .send({ origin: ownerAddress });
    await batchTransferTx.isMined();
    const batchTransferTxReceipt = await batchTransferTx.getReceipt();
    logger(`consumption Receipt status: ${batchTransferTxReceipt.status}`);
    await expectBalance(zkTokenContract, ownerAddress, initialNote);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 4);

    const amounts: bigint[] = [20n, 25n, 30n, 40n, 50n, 60n, 75n, 80n, 85n, 100n, 120n, 130n];
    const amountSum = amounts.reduce((a, b) => a + b, 0n);

    /**
     * owner: [100, 200, 300, 400]
     *         |    |    |    |
     *         |    |    |    [50 (o), 100, 120, 130] batchTx
     *         |    |    |
     *         |    |    [60 (o), 75, 80, 85] batchTx
     *         |    |
     *         |    [50 (o), 40, 50, 60] batchTx
     *         |
     *         [25 (o), 20, 25, 30] batchTx
     *
     * o = owner
     */
    logger(`multiTransfer()...`);
    const multiTransferTx = multiTransferContract.methods
      .multiTransfer(
        zkTokenContract.address.toField(),
        recipients.concat(recipients),
        amounts,
        ownerAddress,
        Fr.fromBuffer(zkTokenContract.methods.batchTransfer.selector),
      )
      .send({ origin: ownerAddress });
    await multiTransferTx.isMined({ timeout: 1000 }); // mining timeout ≥ time needed for the test to finish.
    const multiTransferTxReceipt = await multiTransferTx.getReceipt();
    logger(`Consumption Receipt status: ${multiTransferTxReceipt.status}`);

    await expectBalance(zkTokenContract, ownerAddress, initialNote - amountSum);
    await expectBalance(zkTokenContract, recipients[0], amounts[0] + amounts[numberOfAccounts]);
    await expectBalance(zkTokenContract, recipients[1], amounts[1] + amounts[numberOfAccounts + 1]);
    await expectBalance(zkTokenContract, recipients[2], amounts[2] + amounts[numberOfAccounts + 2]);
    await expectBalance(zkTokenContract, recipients[3], amounts[3] + amounts[numberOfAccounts + 3]);
    await expectBalance(zkTokenContract, recipients[4], amounts[4] + amounts[numberOfAccounts + 4]);
    await expectBalance(zkTokenContract, recipients[5], amounts[5] + amounts[numberOfAccounts + 5]);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(aztecNode, 16);
  }, 850_000);
});
