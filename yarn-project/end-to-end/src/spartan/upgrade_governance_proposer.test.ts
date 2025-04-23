import { EthAddress, type NodeInfo, type PXE, createCompatibleClient, sleep } from '@aztec/aztec.js';
import {
  GovernanceProposerContract,
  L1TxUtils,
  RollupContract,
  createEthereumChain,
  createExtendedL1Client,
  deployL1Contract,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';

import type { ChildProcess } from 'child_process';
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
  let ETHEREUM_HOSTS: string[];
  const forwardProcesses: ChildProcess[] = [];

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    const { process: pxeProcess, port: pxePort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_PXE_PORT,
    });
    forwardProcesses.push(pxeProcess);
    const PXE_URL = `http://127.0.0.1:${pxePort}`;

    const { process: ethProcess, port: ethPort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_ETHEREUM_PORT,
    });
    forwardProcesses.push(ethProcess);
    ETHEREUM_HOSTS = [`http://127.0.0.1:${ethPort}`];

    pxe = await createCompatibleClient(PXE_URL, debugLogger);
    nodeInfo = await pxe.getNodeInfo();
  });

  // We need a separate account to deploy the new governance proposer
  // because the underlying validators are currently producing blob transactions
  // and you can't submit blob and non-blob transactions from the same account
  const setupDeployerAccount = async () => {
    const chain = createEthereumChain(ETHEREUM_HOSTS, 1337);
    const validatorWalletClient = createExtendedL1Client(ETHEREUM_HOSTS, MNEMONIC, chain.chainInfo);
    // const privateKey = generatePrivateKey();
    const privateKey = deployerPrivateKey;
    debugLogger.info(`deployer privateKey: ${privateKey}`);
    const account = privateKeyToAccount(privateKey);
    // check the balance of the account
    const balance = await validatorWalletClient.getBalance({ address: account.address });
    debugLogger.info(`deployer balance: ${balance}`);
    if (balance <= parseEther('5')) {
      debugLogger.info('sending some eth to the deployer account');
      // send some eth to the account
      const tx = await validatorWalletClient.sendTransaction({
        to: account.address,
        value: parseEther('10'),
      });
      const receipt = await validatorWalletClient.waitForTransactionReceipt({ hash: tx });
      debugLogger.info(`receipt: ${stringify(receipt)}`);
    }
    return createExtendedL1Client(ETHEREUM_HOSTS, account, chain.chainInfo);
  };

  it(
    'should deploy new governance proposer',
    async () => {
      /** Helpers */
      const govInfo = async () => {
        const bn = await l1Client.getBlockNumber();
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

      /** Setup */

      const l1Client = await setupDeployerAccount();

      const { address: newGovernanceProposerAddress } = await deployL1Contract(
        l1Client,
        NewGovernanceProposerPayloadAbi,
        NewGovernanceProposerPayloadBytecode,
        [nodeInfo.l1ContractAddresses.registryAddress.toString()],
        '0x2a', // salt
      );
      expect(newGovernanceProposerAddress).toBeDefined();
      expect(newGovernanceProposerAddress.equals(EthAddress.ZERO)).toBeFalsy();
      debugLogger.info(`newGovernanceProposerAddress: ${newGovernanceProposerAddress.toString()}`);
      await updateSequencersConfig(config, {
        governanceProposerPayload: newGovernanceProposerAddress,
      });

      const rollup = new RollupContract(l1Client, nodeInfo.l1ContractAddresses.rollupAddress.toString());
      const governanceProposer = new GovernanceProposerContract(
        l1Client,
        nodeInfo.l1ContractAddresses.governanceProposerAddress.toString(),
      );

      let info = await govInfo();
      expect(info.bn).toBeDefined();
      expect(info.slot).toBeDefined();
      debugLogger.info(`info: ${stringify(info)}`);

      const quorumSize = await governanceProposer.getQuorumSize();
      debugLogger.info(`quorumSize: ${quorumSize}`);
      expect(quorumSize).toBeGreaterThan(0);

      /** GovernanceProposer Voting */

      // Wait until we have enough votes to execute the proposal.
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
        await sleep(12500);
        info = await govInfo();
        debugLogger.info(`slot: ${info.slot}`);
      }

      expect(info.round).toBeGreaterThan(executableRound);

      debugLogger.info(`Executing proposal ${info.round}`);

      const l1TxUtils = new L1TxUtils(l1Client, debugLogger);
      const { receipt } = await governanceProposer.executeProposal(executableRound, l1TxUtils);
      expect(receipt).toBeDefined();
      expect(receipt.status).toEqual('success');
      debugLogger.info(`Executed proposal ${info.round}`);
    },
    1000 * 60 * 10,
  );
});
