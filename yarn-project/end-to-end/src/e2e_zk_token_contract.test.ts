import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, Contract, ContractDeployer, Wallet } from '@aztec/aztec.js';
import { ZkTokenContractAbi } from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';
import { L2BlockL2Logs, LogType, TxStatus } from '@aztec/types';
import { AztecRPCServer } from '@aztec/aztec-rpc';

import { setup } from './utils.js';

describe('e2e_zk_token_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let wallet: Wallet;
  let accounts: AztecAddress[];
  let logger: DebugLogger;

  let contract: Contract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, accounts, wallet, logger } = await setup(2));
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    await aztecRpcServer?.stop();
  });

  const expectBalance = async (owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await contract.methods.getBalance(ownerPublicKey.toBigInts()).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const expectsNumOfEncryptedLogsInTheLastBlockToBe = async (numEncryptedLogs: number) => {
    const l2BlockNum = await aztecNode.getBlockHeight();
    const encryptedLogs = await aztecNode.getLogs(l2BlockNum, 1, LogType.ENCRYPTED);
    const unrolledLogs = L2BlockL2Logs.unrollLogs(encryptedLogs);
    expect(unrolledLogs.length).toBe(numEncryptedLogs);
  };

  const expectUnencryptedLogsFromLastBlockToBe = async (logMessages: string[]) => {
    const l2BlockNum = await aztecNode.getBlockHeight();
    const unencryptedLogs = await aztecNode.getLogs(l2BlockNum, 1, LogType.UNENCRYPTED);
    const unrolledLogs = L2BlockL2Logs.unrollLogs(unencryptedLogs);
    const asciiLogs = unrolledLogs.map(log => log.toString('ascii'));

    expect(asciiLogs).toStrictEqual(logMessages);
  };

  const deployContract = async (initialBalance = 0n, owner = { x: 0n, y: 0n }) => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(ZkTokenContractAbi, aztecRpcServer);
    const tx = deployer.deploy(initialBalance, owner).send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, ZkTokenContractAbi, wallet);
    await tx.isMined(0, 0.1);
    const minedReceipt = await tx.getReceipt();
    expect(minedReceipt.status).toEqual(TxStatus.MINED);
    logger('L2 contract deployed');
    return contract;
  };

  /**
   * Milestone 1.3.
   * https://hackmd.io/AG5rb9DyTRu3y7mBptWauA
   */
  it('1.3 should deploy zk token contract with initial token minted to the account', async () => {
    const initialBalance = 987n;
    const owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
    await deployContract(initialBalance, owner.toBigInts());
    await expectBalance(accounts[0], initialBalance);
    await expectBalance(accounts[1], 0n);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
    await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);
  }, 30_000);

  /**
   * Milestone 1.4.
   */
  it('1.4 should call mint and increase balance', async () => {
    const mintAmount = 65n;

    const [owner] = accounts;
    const ownerPublicKey = (await aztecRpcServer.getAccountPublicKey(owner)).toBigInts();

    const deployedContract = await deployContract(0n, ownerPublicKey);
    await expectBalance(owner, 0n);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
    await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);

    const tx = deployedContract.methods.mint(mintAmount, ownerPublicKey).send({ origin: owner });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
    await expectBalance(owner, mintAmount);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
    await expectUnencryptedLogsFromLastBlockToBe(['Coins minted']);
  }, 60_000);

  /**
   * Milestone 1.5.
   */
  it('1.5 should call transfer and increase balance of another account', async () => {
    const initialBalance = 987n;
    const transferAmount = 654n;
    const [owner, receiver] = accounts;

    await deployContract(initialBalance, (await aztecRpcServer.getAccountPublicKey(owner)).toBigInts());

    await expectBalance(owner, initialBalance);
    await expectBalance(receiver, 0n);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
    await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);

    const tx = contract.methods
      .transfer(
        transferAmount,
        (await aztecRpcServer.getAccountPublicKey(owner)).toBigInts(),
        (await aztecRpcServer.getAccountPublicKey(receiver)).toBigInts(),
      )
      .send({ origin: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);

    await expectBalance(owner, initialBalance - transferAmount);
    await expectBalance(receiver, transferAmount);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(2);
    await expectUnencryptedLogsFromLastBlockToBe(['Coins transferred']);
  }, 60_000);
});
