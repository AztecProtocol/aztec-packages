import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import {
  CompleteAddress,
  type DebugLogger,
  Fr,
  GrumpkinScalar,
  type SentTx,
  TxStatus,
  sleep,
} from '@aztec/aztec.js';
import { BootstrapNode } from '@aztec/p2p';
import { type PXEService, createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe';

import fs from 'fs';

import { expectsNumOfNoteEncryptedLogsInTheLastBlockToBe, setup } from './fixtures/utils.js';
import { NodeContext, createBootstrapNode, createNode, createNodes, generatePeerIdPrivateKeys } from './fixtures/setup_p2p_test.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_BLOCK = 4;
const BOOT_NODE_UDP_PORT = 40400;

const PEER_ID_PRIVATE_KEYS = generatePeerIdPrivateKeys(NUM_NODES);

describe('e2e_p2p_attestations', () => {
  let config: AztecNodeConfig;
  let logger: DebugLogger;
  let teardown: () => Promise<void>;
  let bootstrapNode: BootstrapNode;
  let bootstrapNodeEnr: string;

  beforeEach(async () => {
    // TODO: cleanup this test Enable validators
    ({ teardown, config, logger } = await setup(0));
    bootstrapNode = await createBootstrapNode(BOOT_NODE_UDP_PORT);
    bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

    // TODO: refactor? Config settings
    config.minTxsPerBlock = NUM_TXS_PER_BLOCK;
    config.maxTxsPerBlock = NUM_TXS_PER_BLOCK;
  });

  afterEach(() => teardown());

  afterAll(() => {
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`./data-${i}`, { recursive: true, force: true });
    }
  });

  it('should collect attestations from all peers', async () => {
    // create the bootstrap node for the network
    if (!bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }
    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    const nodes: AztecNodeService[] = await createNodes(config, PEER_ID_PRIVATE_KEYS, bootstrapNodeEnr, NUM_NODES, BOOT_NODE_UDP_PORT, /*activate validators*/true);

    // wait a bit for peers to discover each other
    await sleep(2000);

    // just send one transaction for now
    for (const node of nodes) {
      const context = await createPXEServiceAndSubmitTransactions(node);
      contexts.push(context);
    }

    // now ensure that all txs were successfully mined
    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
      ),
    );

    // shutdown all nodes.
    for (const context of contexts) {
      await context.node.stop();
      await context.pxeService.stop();
    }
    await bootstrapNode.stop();
  });


  // creates an instance of the PXE and submit a given number of transactions to it.
  const createPXEServiceAndSubmitTransactions = async (
    node: AztecNodeService,
  ): Promise<NodeContext> => {
    const rpcConfig = getRpcConfig();
    const pxeService = await createPXEService(node, rpcConfig, true);

    const secretKey = Fr.random();
    const completeAddress = CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, Fr.random());
    await pxeService.registerAccount(secretKey, completeAddress.partialAddress);

    const tx = await submitTx(pxeService);
    return {
      txs: [tx],
      account: completeAddress.address,
      pxeService,
      node,
    };
  };

  // submits a set of transactions to the provided Private eXecution Environment (PXE)
  const submitTx = async (pxe: PXEService) => {
      const accountManager = getSchnorrAccount(pxe, Fr.random(), GrumpkinScalar.random(), Fr.random());
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.create({
        contractAddressSalt: accountManager.salt,
        skipClassRegistration: true,
        skipPublicDeployment: true,
        universalDeploy: true,
      });
      await deployMethod.prove({});
      const tx = deployMethod.send();

      const txHash = await tx.getTxHash();

      logger.info(`Tx sent with hash ${txHash}`);
      const receipt = await tx.getReceipt();
      expect(receipt).toEqual(
        expect.objectContaining({
          status: TxStatus.PENDING,
          error: '',
        }),
      );
      logger.info(`Receipt received for ${txHash}`);
    return tx;
  };
});
