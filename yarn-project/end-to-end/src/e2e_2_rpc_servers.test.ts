import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, Wallet } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { ZkTokenContract } from '@aztec/noir-contracts/types';
import { L2BlockL2Logs, LogType, TxStatus } from '@aztec/types';

import { setup, setupWithoutDeployingContractsAndAztecNode } from './utils.js';

describe('e2e_2_rpc_servers', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer1: AztecRPCServer;
  let aztecRpcServer2: AztecRPCServer;
  let wallet1: Wallet;
  let wallet2: Wallet;
  let accounts1: AztecAddress[];
  let accounts2: AztecAddress[];
  let logger: DebugLogger;

  let contract: ZkTokenContract;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer: aztecRpcServer1, accounts: accounts1, wallet: wallet1, logger } = await setup(1));
    ({
      aztecRpcServer: aztecRpcServer2,
      accounts: accounts2,
      wallet: wallet2,
    } = await setupWithoutDeployingContractsAndAztecNode(1, aztecNode));
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    await aztecRpcServer1?.stop();
    await aztecRpcServer2?.stop();
  });

  const expectBalance = async (owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer1.getPublicKey(owner);
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
    const tx = ZkTokenContract.deploy(aztecRpcServer1, initialBalance, owner).send();
    const receipt = await tx.getReceipt();
    contract = new ZkTokenContract(receipt.contractAddress!, wallet1);
    await tx.isMined(0, 0.1);
    const minedReceipt = await tx.getReceipt();
    expect(minedReceipt.status).toEqual(TxStatus.MINED);
    logger('L2 contract deployed');
    return contract;
  };

  /**
   * Milestone 1.5.
   */
  it('1.5 should call transfer and increase balance of another account', async () => {
    const initialBalance = 987n;
    const transferAmount = 654n;
    const [owner] = accounts1;
    const [receiver] = accounts2;

    const [receiverPubKey, receiverPartialAddress] = (await aztecRpcServer2.getPublicKeyAndPartialAddress(receiver))!;
    aztecRpcServer1.addPublicKeyAndPartialAddress(receiver, receiverPubKey, receiverPartialAddress);

    await deployContract(initialBalance, (await aztecRpcServer1.getAccountPublicKey(owner)).toBigInts());

    await expectBalance(owner, initialBalance);
    await expectBalance(receiver, 0n);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);
    await expectUnencryptedLogsFromLastBlockToBe(['Balance set in constructor']);

    const tx = contract.methods
      .transfer(
        transferAmount,
        (await aztecRpcServer1.getPublicKey(owner)).toBigInts(),
        (await aztecRpcServer1.getPublicKey(receiver)).toBigInts(),
      )
      .send({ origin: accounts1[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);

    await expectBalance(owner, initialBalance - transferAmount);
    await expectBalance(receiver, transferAmount);

    await expectsNumOfEncryptedLogsInTheLastBlockToBe(2);
    await expectUnencryptedLogsFromLastBlockToBe(['Coins transferred']);
  }, 60_000);
});
