import { AztecNode } from '@aztec/aztec-node';
import { HttpNode } from './http-node.js';
import { ContractDeployer, createAztecRPCServer, TxStatus, TxHash, Point } from '@aztec/aztec.js';
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

export async function waitUntilReady(aztecNode: AztecNode, logger: DebugLogger) {
  while ((await aztecNode.isReady()) === false) {
    logger(`Aztec node not ready, will wait 10 seconds and check again...`);
    await sleep(10000);
  }
}

export async function deployL2Contract(url: string, interval: number, logger: DebugLogger) {
  const node: AztecNode = new HttpNode(url);
  await waitUntilReady(node, logger);
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
    await sleep(interval > 0 ? interval : 1);
    for (let i = 0; i < outstandingTxs.length; i++) {
      const hash = outstandingTxs[i];
      const receipt = await aztecRpcServer.getTxReceipt(hash);
      if (receipt.status == TxStatus.MINED) {
        logger(`Tx ${hash.toString()} settled, contract address ${receipt.contractAddress}`);
        outstandingTxs.splice(i, 1);
      }
    }
  } while (interval != 0);
}
