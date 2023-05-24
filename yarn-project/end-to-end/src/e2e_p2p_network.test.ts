import { AztecNode, AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, ContractDeployer, SentTx, TxStatus } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { TestContractAbi } from '@aztec/noir-contracts/examples';

import { mnemonicToAccount } from 'viem/accounts';
import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import { MNEMONIC } from './fixtures.js';

const logger = createDebugLogger('aztec:e2e_p2p_network');

const config = getConfigEnvVars();

const NUM_NODES = 2;

interface NodeContext {
  node: AztecNodeService;
  rpcServer: AztecRPCServer;
  txs: SentTx[];
  account: AztecAddress;
}

const createNode = async (tcpListenPort: number) => {
  const newConfig: AztecNodeConfig = {
    ...config,
    tcpListenPort,
    minTxsPerBlock: 4,
    maxTxsPerBlock: 4,
    p2pEnabled: true,
    serverMode: false,
  };
  return await AztecNodeService.createAndSync(newConfig);
};

const submitTxsTo = async (aztecRpcServer: AztecRPCServer, account: AztecAddress, numTxs: number) => {
  const txs: SentTx[] = [];
  for (let i = 0; i < numTxs; i++) {
    const deployer = new ContractDeployer(TestContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    logger(`Tx sent with hash ${await tx.getTxHash()}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        from: account,
        to: undefined,
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger(`Receipt received and expecting contract deployment at ${receipt.contractAddress}`);
    txs.push(tx);
  }
  return txs;
};

const createAztecRpcServerAndSubmitTransactions = async (node: AztecNode, numTxs: number) => {
  const aztecRpcServer = await createAztecRpcServer(1, node);
  const accounts = await aztecRpcServer.getAccounts();

  const txs = await submitTxsTo(aztecRpcServer, accounts[0], numTxs);
  return {
    txs,
    account: accounts[0],
    rpcServer: aztecRpcServer,
    node,
  } as NodeContext;
};

describe('e2e_p2p_network', () => {
  beforeEach(async () => {
    const account = mnemonicToAccount(MNEMONIC);
    const privKey = account.getHdKey().privateKey;
    const { rollupAddress, unverifiedDataEmitterAddress } = await deployL1Contracts(config.rpcUrl, account, logger);

    config.publisherPrivateKey = Buffer.from(privKey!);
    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;
  }, 60_000);

  it('should rollup txs from all peers', async () => {
    const contexts: NodeContext[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      const node = await createNode(40401 + i);
      const context = await createAztecRpcServerAndSubmitTransactions(node, 2);
      contexts.push(context);
    }

    // now ensure that all contracts were deployed
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

    for (const context of contexts) {
      await context.node.stop();
      await context.rpcServer.stop();
    }
  }, 60_000);
});
