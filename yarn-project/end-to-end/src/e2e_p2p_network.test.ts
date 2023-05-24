import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, ContractDeployer, TxStatus } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { TestContractAbi } from '@aztec/noir-contracts/examples';

import { mnemonicToAccount } from 'viem/accounts';
import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import { MNEMONIC } from './fixtures.js';

const logger = createDebugLogger('aztec:e2e_p2p_network');

const config = getConfigEnvVars();

const createNode = async (tcpListenPort: number) => {
  const newConfig: AztecNodeConfig = {
    ...config,
    tcpListenPort,
  };
  const node = await AztecNodeService.createAndSync(newConfig);
  return node;
};

describe('e2e_p2p_network', () => {
  let node: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];

  beforeEach(async () => {
    const account = mnemonicToAccount(MNEMONIC);
    const privKey = account.getHdKey().privateKey;
    const { rollupAddress, unverifiedDataEmitterAddress } = await deployL1Contracts(config.rpcUrl, account, logger);

    config.publisherPrivateKey = Buffer.from(privKey!);
    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;
  }, 60_000);

  afterEach(async () => {
    await node?.stop();
    await aztecRpcServer?.stop();
  });

  it('should rollup txs from all peers', async () => {
    node = await createNode(40400);
    node = await AztecNodeService.createAndSync(config);
    aztecRpcServer = await createAztecRpcServer(1, node);
    accounts = await aztecRpcServer.getAccounts();

    const deployer = new ContractDeployer(TestContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    logger(`Tx sent with hash ${await tx.getTxHash()}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        from: accounts[0],
        to: undefined,
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger(`Receipt received and expecting contract deployment at ${receipt.contractAddress}`);
    const isMined = await tx.isMined(0, 0.1);
    const receiptAfterMined = await tx.getReceipt();

    expect(isMined).toBe(true);
    expect(receiptAfterMined.status).toBe(TxStatus.MINED);
    const contractAddress = receipt.contractAddress!;
    expect(await aztecRpcServer.isContractDeployed(contractAddress)).toBe(true);
    expect(await aztecRpcServer.isContractDeployed(AztecAddress.random())).toBe(false);
  }, 30_000);
});
