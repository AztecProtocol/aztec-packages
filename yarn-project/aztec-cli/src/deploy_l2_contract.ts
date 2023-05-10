import { AztecNode } from '@aztec/aztec-node';
import { HttpNode } from './http-node.js';
import { Contract, ContractDeployer, createAztecRPCServer, TxStatus, TxHash, Point } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { ContractAbi } from '@aztec/foundation/abi';
import { sleep } from '@aztec/foundation/sleep';
import { ZkTokenContractAbi } from '@aztec/noir-contracts/examples';

export async function createAztecRpc(numberOfAccounts = 1, aztecNode: AztecNode) {
  const arc = await createAztecRPCServer(aztecNode);

  for (let i = 0; i < numberOfAccounts; ++i) {
    await arc.addAccount();
  }

  return arc;
}

const pointToPublicKey = (point: Point) => {
  const x = point.buffer.subarray(0, 32);
  const y = point.buffer.subarray(32, 64);
  return {
    x: toBigIntBE(x),
    y: toBigIntBE(y),
  };
};

export async function deployL2Contract(url: string, logger: DebugLogger, loop: boolean, interval: number) {
  const node: AztecNode = new HttpNode(url);
  const aztecRpcServer = await createAztecRpc(2, node);
  const accounts = await aztecRpcServer.getAccounts();
  const outstandingTxs: TxHash[] = [];

  do {
    logger(`Deploying L2 contract...`);
    const initialBalance = 1_000_000_000n;
    const zkContract = ZkTokenContractAbi as ContractAbi;
    const deployer = new ContractDeployer(zkContract, aztecRpcServer);
    const owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
    const d = deployer.deploy(initialBalance, pointToPublicKey(owner));
    await d.create();
    const tx = d.send();
    const txHash = await tx.getTxHash();
    outstandingTxs.push(txHash);
    logger('L2 contract deployed');
    await sleep(loop ? interval : 1);
    for (let i = 0; i < outstandingTxs.length; i++) {
      const hash = outstandingTxs[i];
      const receipt = await aztecRpcServer.getTxReceipt(hash);
      if (receipt.status == TxStatus.MINED) {
        logger(`Tx ${hash.toString()} settled, contract address ${receipt.contractAddress}`);
        outstandingTxs.splice(i, 1);
      }
    }
  } while (loop);
}

export async function deployL2ContractAndMakeTransfers(url: string, logger: DebugLogger) {
  const node: AztecNode = new HttpNode(url);
  const aztecRpcServer = await createAztecRpc(2, node);
  const accounts = await aztecRpcServer.getAccounts();

  logger(`Deploying L2 contract...`);
  const initialBalance = 1_000_000_000n;
  const zkContract = ZkTokenContractAbi as ContractAbi;
  const deployer = new ContractDeployer(zkContract, aztecRpcServer);
  const owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
  const receiver = await aztecRpcServer.getAccountPublicKey(accounts[1]);
  const d = deployer.deploy(initialBalance, pointToPublicKey(owner));
  await d.create();
  const tx = d.send();
  const receipt = await tx.getReceipt();
  const contract = new Contract(receipt.contractAddress!, zkContract, aztecRpcServer);
  await tx.isMined(0, 1);
  await tx.getReceipt();
  logger('L2 contract deployed');

  while (true) {
    await sleep(10000);
    logger(`Making transfer...`);
    const transferAmount = 1n;
    const transferTx = contract.methods
      .transfer(transferAmount, pointToPublicKey(owner), pointToPublicKey(receiver))
      .send({ from: accounts[0] });
    logger(`Transfer sent`);
    await transferTx.isMined(0, 1);
    logger(`Transfer mined`);
    await transferTx.getReceipt();
  }
}
