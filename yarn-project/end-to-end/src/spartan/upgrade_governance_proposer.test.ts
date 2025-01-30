import { type NodeInfo, type PXE, createCompatibleClient, sleep } from '@aztec/aztec.js';
import {
  GovernanceProposerContract,
  L1TxUtils,
  RollupContract,
  createEthereumChain,
  createL1Clients,
  deployL1Contract,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';

import { privateKeyToAccount } from 'viem/accounts';
import { parseEther, stringify } from 'viem/utils';

import { MNEMONIC } from '../fixtures/fixtures.js';
import { isK8sConfig, setupEnvironment, startPortForward, updateSequencersConfig } from './utils.js';

// random private key
const deployerPrivateKey = '0x23206a40226aad90d5673b8adbbcfe94a617e7a6f9e59fc68615fe1bd4bc72f1';

const config = setupEnvironment(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}

const debugLogger = createLogger('e2e:spartan-test:upgrade_governance_proposer');

describe('spartan_upgrade_governance_proposer', () => {
  let pxe: PXE;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOST: string;
  beforeAll(async () => {
    await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_PXE_PORT,
      hostPort: config.HOST_PXE_PORT,
    });
    await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_ETHEREUM_PORT,
      hostPort: config.HOST_ETHEREUM_PORT,
    });
    ETHEREUM_HOST = `http://127.0.0.1:${config.HOST_ETHEREUM_PORT}`;

    await startPortForward({
      resource: `svc/metrics-grafana`,
      namespace: 'metrics',
      containerPort: config.CONTAINER_METRICS_PORT,
      hostPort: config.HOST_METRICS_PORT,
    });

    const PXE_URL = `http://127.0.0.1:${config.HOST_PXE_PORT}`;
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
    nodeInfo = await pxe.getNodeInfo();
  });

  const setupDeployerAccount = async () => {
    const chain = createEthereumChain(ETHEREUM_HOST, 1337);
    const { walletClient: validatorWalletClient } = createL1Clients(ETHEREUM_HOST, MNEMONIC, chain.chainInfo);
    // const privateKey = generatePrivateKey();
    const privateKey = deployerPrivateKey;
    debugLogger.info(`deployer privateKey: ${privateKey}`);
    const account = privateKeyToAccount(privateKey);
    // check the balance of the account
    const balance = await validatorWalletClient.getBalance({ address: account.address });
    debugLogger.info(`deployer balance: ${balance}`);
    if (balance <= parseEther('0.5')) {
      debugLogger.info('sending some eth to the deployer account');
      // send some eth to the account
      const tx = await validatorWalletClient.sendTransaction({
        to: account.address,
        value: parseEther('1'),
      });
      const receipt = await validatorWalletClient.waitForTransactionReceipt({ hash: tx });
      debugLogger.info(`receipt: ${stringify(receipt)}`);
    }
    return createL1Clients(ETHEREUM_HOST, account, chain.chainInfo);
  };

  it(
    'should deploy new governance proposer',
    async () => {
      // We need a separate account to deploy the new governance proposer
      // because the underlying validators are currently producing blob transactions
      // and you can't submit blob and non-blob transactions from the same account
      const { walletClient: l1WalletClient, publicClient: l1PublicClient } = await setupDeployerAccount();

      debugLogger.info('asdf2');
      const { address: newGovernanceProposerAddress } = await deployL1Contract(
        l1WalletClient,
        l1PublicClient,
        NewGovernanceProposerPayloadAbi,
        NewGovernanceProposerPayloadBytecode,
        [nodeInfo.l1ContractAddresses.registryAddress.toString()],
        '0x2a', // salt
      );
      debugLogger.info('asdf3');
      expect(newGovernanceProposerAddress).toBeDefined();
      debugLogger.info(`newGovernanceProposerAddress: ${newGovernanceProposerAddress.toString()}`);

      const rollup = new RollupContract(l1PublicClient, nodeInfo.l1ContractAddresses.rollupAddress.toString());
      const governanceProposer = new GovernanceProposerContract(
        l1PublicClient,
        nodeInfo.l1ContractAddresses.governanceProposerAddress.toString(),
      );
      const govInfo = async () => {
        const bn = await l1PublicClient.getBlockNumber();
        const slot = await rollup.getSlotNumber();
        const round = await governanceProposer.computeRound(slot);
        const info = await governanceProposer.getRoundInfo(
          nodeInfo.l1ContractAddresses.rollupAddress.toString(),
          round,
        );
        const leaderVotes = await governanceProposer.getProposalVotes(
          nodeInfo.l1ContractAddresses.rollupAddress.toString(),
          round,
          info.leader,
        );
        return { bn, slot, round, info, leaderVotes };
      };

      await updateSequencersConfig(config, {
        governanceProposerPayload: newGovernanceProposerAddress,
      });

      let info = await govInfo();
      expect(info.bn).toBeDefined();
      expect(info.slot).toBeDefined();
      debugLogger.info(`info: ${stringify(info)}`);

      const quorumSize = await governanceProposer.getQuorumSize();
      debugLogger.info(`quorumSize: ${quorumSize}`);
      expect(quorumSize).toBeGreaterThan(0);
      while (true) {
        info = await govInfo();
        debugLogger.info(`Leader votes: ${info.leaderVotes}`);
        if (info.leaderVotes >= quorumSize) {
          debugLogger.info(`Leader votes have reached quorum size`);
          break;
        }
        await sleep(12000);
      }

      const executableRound = info.round;
      debugLogger.info(`Waiting for round ${executableRound + 1n}`);

      while (info.round === executableRound) {
        await sleep(12000);
        info = await govInfo();
        debugLogger.info(`slot: ${info.slot}`);
      }

      expect(info.round).toBeGreaterThan(executableRound);

      debugLogger.info(`Executing proposal ${info.round}`);
      const l1TxUtils = new L1TxUtils(l1PublicClient, l1WalletClient, debugLogger);
      const { receipt } = await governanceProposer.executeProposal(info.round, l1TxUtils);
      expect(receipt).toBeDefined();
      expect(receipt.status).toEqual('success');
      debugLogger.info(`Executed proposal ${info.round}`);
    },
    1000 * 60 * 10,
  );
});
