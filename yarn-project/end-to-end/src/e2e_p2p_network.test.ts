import { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, ContractDeployer, Fr, SentTx } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { TestContractAbi } from '@aztec/noir-contracts/examples';
import { BootstrapNode, P2PConfig, createLibP2PPeerId, exportLibP2PPeerIdToString } from '@aztec/p2p';
import {
  AztecRPCServer,
  ConstantKeyPair,
  createAztecRPCServer,
  getConfigEnvVars as getRpcConfig,
} from '@aztec/aztec-rpc';
import { TxStatus } from '@aztec/types';
import { CircuitsWasm, Point, getContractDeploymentInfo } from '@aztec/circuits.js';
import { computeContractAddressFromPartial } from '@aztec/circuits.js/abis';
import { Grumpkin } from '@aztec/circuits.js/barretenberg';

import { setup } from './utils.js';

const NUM_NODES = 4;
const NUM_TXS_PER_BLOCK = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_TCP_PORT = 40400;

interface NodeContext {
  node: AztecNodeService;
  rpcServer: AztecRPCServer;
  txs: SentTx[];
  account: AztecAddress;
}

describe('e2e_p2p_network', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let config: AztecNodeConfig;
  let logger: DebugLogger;

  beforeEach(async () => {
    ({ aztecNode, aztecRpcServer, config, logger } = await setup(0));
  }, 100_000);

  afterEach(async () => {
    await aztecNode.stop();
    await aztecRpcServer.stop();
  });

  it('should rollup txs from all peers', async () => {
    // create the bootstrap node for the network
    const bootstrapNode = await createBootstrapNode();
    const bootstrapNodeAddress = `/ip4/127.0.0.1/tcp/${BOOT_NODE_TCP_PORT}/p2p/${bootstrapNode
      .getPeerId()!
      .toString()}`;
    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      const node = await createNode(i + 1 + BOOT_NODE_TCP_PORT, bootstrapNodeAddress);
      const context = await createAztecRpcServerAndSubmitTransactions(node, NUM_TXS_PER_NODE);
      contexts.push(context);
    }

    // now ensure that all txs were successfully mined
    for (const context of contexts) {
      for (const tx of context.txs) {
        const isMined = await tx.isMined(0, 0.1);
        const receiptAfterMined = await tx.getReceipt();

        expect(isMined).toBe(true);
        expect(receiptAfterMined.status).toBe(TxStatus.MINED);
        const contractAddress = receiptAfterMined.contractAddress!;
        expect(await context.rpcServer.isContractDeployed(contractAddress)).toBe(true);
        expect(await context.rpcServer.isContractDeployed(AztecAddress.random())).toBe(false);
      }
    }

    // shutdown all nodes.
    for (const context of contexts) {
      await context.node.stop();
      await context.rpcServer.stop();
    }
    await bootstrapNode.stop();
  }, 80_000);

  const createBootstrapNode = async () => {
    const peerId = await createLibP2PPeerId();
    const bootstrapNode = new BootstrapNode(logger);
    const config: P2PConfig = {
      p2pEnabled: true,
      tcpListenPort: BOOT_NODE_TCP_PORT,
      tcpListenIp: '0.0.0.0',
      announceHostname: '127.0.0.1',
      announcePort: BOOT_NODE_TCP_PORT,
      peerIdPrivateKey: exportLibP2PPeerIdToString(peerId),
      serverMode: true,
      minPeerCount: 10,
      maxPeerCount: 100,

      // TODO: the following config options are not applicable to bootstrap nodes
      p2pBlockCheckIntervalMS: 1000,
      l2QueueSize: 1,
      transactionProtocol: '',
      bootstrapNodes: [''],
    };
    await bootstrapNode.start(config);

    return bootstrapNode;
  };

  // creates a P2P enabled instance of Aztec Node Service
  const createNode = async (tcpListenPort: number, bootstrapNode: string) => {
    const newConfig: AztecNodeConfig = {
      ...config,
      tcpListenPort,
      tcpListenIp: '0.0.0.0',
      enableNat: false,
      bootstrapNodes: [bootstrapNode],
      minTxsPerBlock: NUM_TXS_PER_BLOCK,
      maxTxsPerBlock: NUM_TXS_PER_BLOCK,
      p2pEnabled: true,
      serverMode: false,
    };
    return await AztecNodeService.createAndSync(newConfig);
  };

  // submits a set of transactions to the provided aztec rpc server
  const submitTxsTo = async (
    aztecRpcServer: AztecRPCServer,
    account: AztecAddress,
    numTxs: number,
    publicKey: Point,
  ) => {
    const txs: SentTx[] = [];
    for (let i = 0; i < numTxs; i++) {
      const salt = Fr.random();
      const deploymentInfo = await getContractDeploymentInfo(TestContractAbi, [], salt, publicKey);
      const deployer = new ContractDeployer(TestContractAbi, aztecRpcServer, publicKey);
      const tx = deployer.deploy().send({ contractAddressSalt: salt });
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      const receipt = await tx.getReceipt();
      expect(receipt).toEqual(
        expect.objectContaining({
          origin: deploymentInfo.address,
          status: TxStatus.PENDING,
          error: '',
          contractAddress: deploymentInfo.address,
        }),
      );
      logger(`Receipt received and expecting contract deployment at ${receipt.contractAddress}`);
      txs.push(tx);
    }
    return txs;
  };

  // creates an instance of the aztec rpc server and submit a given number of transactions to it.
  const createAztecRpcServerAndSubmitTransactions = async (
    node: AztecNodeService,
    numTxs: number,
  ): Promise<NodeContext> => {
    const rpcConfig = getRpcConfig();
    const aztecRpcServer = await createAztecRPCServer(node, rpcConfig);
    const keyPair = ConstantKeyPair.random(await Grumpkin.new());
    const partialAddress = Fr.random();
    const publicKey = keyPair.getPublicKey();
    const address = computeContractAddressFromPartial(await CircuitsWasm.get(), publicKey, partialAddress);
    const account = await aztecRpcServer.addAccount(await keyPair.getPrivateKey(), address, partialAddress);

    const txs = await submitTxsTo(aztecRpcServer, account, numTxs, publicKey);
    return {
      txs,
      account,
      rpcServer: aztecRpcServer,
      node,
    };
  };
});
