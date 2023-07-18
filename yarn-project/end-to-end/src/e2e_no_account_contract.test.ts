import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer, Point } from '@aztec/aztec-rpc';
import { AztecAddress, BaseWallet, Contract, Wallet, generatePublicKey } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { NoAccountContract } from '@aztec/noir-contracts/types';
import { ExecutionRequest, L2BlockL2Logs, LogType, PackedArguments, TxExecutionRequest, TxStatus } from '@aztec/types';

import { randomBytes } from 'crypto';

import { setup } from './utils.js';
import { CircuitsWasm, Fr, TxContext } from '@aztec/circuits.js';

describe('e2e_no_account_contract', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let wallet: Wallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let senderPubKey: Point;
  let recipientPubKey: Point;
  let logger: DebugLogger;

  let contract: NoAccountContract;

  beforeEach(async () => {
    let accounts: AztecAddress[];
    ({ aztecNode, aztecRpcServer, accounts, wallet, logger } = await setup(2));
    sender = accounts[0];
    recipient = accounts[1];
    senderPubKey = await aztecRpcServer.getAccountPublicKey(sender);
    recipientPubKey = await aztecRpcServer.getAccountPublicKey(recipient);
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

  const deployContract = async (initialBalance: bigint, sender: Point, recipient: Point) => {
    logger(`Deploying L2 contract...`);
    const tx = NoAccountContract.deploy(
      aztecRpcServer,
      initialBalance,
      sender.toBigInts(),
      recipient.toBigInts(),
    ).send();
    const receipt = await tx.getReceipt();
    contract = new NoAccountContract(receipt.contractAddress!, wallet);
    await tx.isMined(0, 0.1);
    const minedReceipt = await tx.getReceipt();
    expect(minedReceipt.status).toEqual(TxStatus.MINED);
    logger('L2 contract deployed');
    return contract;
  };

  it('Arbitrary non-contract account can call a private function on a contract', async () => {
    const initialBalance = 987n;
    
    const pokerPrivKey = randomBytes(32);
    const pokerPubKey = await generatePublicKey(pokerPrivKey);
    const poker = AztecAddress.fromBuffer(pokerPubKey.x.toBuffer());
  
    await deployContract(initialBalance, senderPubKey, recipientPubKey);

    // Check that all the balances are correct and that exactly 1 encrypted log was emitted
    await expectBalance(sender, initialBalance);
    await expectBalance(recipient, 0n);
    await expectsNumOfEncryptedLogsInTheLastBlockToBe(1);

    

    const accountImpl = new PassThroughWallet(aztecRpcServer);
    await accountImpl.addAccount(pokerPrivKey, poker, new Fr(0n))
    
    // await aztecRpcServer.addAccount(pokerPrivKey, poker, new Fr(0n));

    const contractWithNoContractWallet = new NoAccountContract(contract.address, accountImpl);

    // Finally check that arbitrary non-contract address can call the poke function
    const tx = contractWithNoContractWallet.methods
      .poke()
      .send({ origin: poker });

    await tx.isMined(0, 0.1);
    // const receipt = await tx.getReceipt();

    // expect(receipt.status).toBe(TxStatus.MINED);

    // await expectBalance(senderPubKey, initialBalance - transferAmount);
    // await expectBalance(recipientPubKey, transferAmount);

    // await expectsNumOfEncryptedLogsInTheLastBlockToBe(2);
  }, 60_000);
});

/**
 * Simple wallet implementation for use when deploying contracts only.
 */
class PassThroughWallet extends BaseWallet {
  getAddress(): AztecAddress {
    return AztecAddress.ZERO;
  }
  async createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<TxExecutionRequest> {
    if (executions.length !== 1) {
      throw new Error(`Deployer wallet can only run one execution at a time (requested ${executions.length})`);
    }
    const [execution] = executions;
    const wasm = await CircuitsWasm.get();
    const packedArguments = await PackedArguments.fromArgs(execution.args, wasm);
    return Promise.resolve(
      new TxExecutionRequest(execution.to, execution.functionData, packedArguments.hash, txContext, [packedArguments]),
    );
  }
}