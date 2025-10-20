import { type AztecNode, EthAddress, type NodeInfo, createAztecNodeClient, sleep } from '@aztec/aztec.js';
import {
  GovernanceProposerContract,
  RollupContract,
  createEthereumChain,
  createExtendedL1Client,
  createL1TxUtilsFromViemWallet,
  deployL1Contract,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';

import type { ChildProcess } from 'child_process';
import { privateKeyToAccount } from 'viem/accounts';
import { parseEther, stringify } from 'viem/utils';

import { MNEMONIC } from '../fixtures/fixtures.js';
import {
  setupEnvironment,
  startPortForwardForEthereum,
  startPortForwardForRPC,
  updateSequencersConfig,
} from './utils.js';

// random private key
const deployerPrivateKey = '0x23206a40226aad90d5673b8adbbcfe94a617e7a6f9e59fc68615fe1bd4bc72f1';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:upgrade_governance_proposer');

describe('spartan_upgrade_governance_proposer', () => {
  let aztecNode: AztecNode;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOSTS: string[];
  const forwardProcesses: ChildProcess[] = [];

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    const { process: ethereumProcess, port: ethereumPort } = await startPortForwardForEthereum(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    forwardProcesses.push(ethereumProcess);

    const nodeUrl = `http://127.0.0.1:${aztecRpcPort}`;
    const ethereumUrl = `http://127.0.0.1:${ethereumPort}`;

    aztecNode = createAztecNodeClient(nodeUrl);
    nodeInfo = await aztecNode.getNodeInfo();

    ETHEREUM_HOSTS = [ethereumUrl];
  });

  // We need a separate account to deploy the new governance proposer
  // because the underlying validators are currently producing blob transactions
  // and you can't submit blob and non-blob transactions from the same account
  const setupDeployerAccount = async () => {
    const chain = createEthereumChain(ETHEREUM_HOSTS, nodeInfo.l1ChainId);
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
        const leaderVotes = await governanceProposer.getPayloadSignals(
          nodeInfo.l1ContractAddresses.rollupAddress.toString(),
          round,
          info.payloadWithMostSignals,
        );
        return { bn, slot, round, info, leaderVotes };
      };

      /** Setup */

      const l1Client = await setupDeployerAccount();

      const rollup = new RollupContract(l1Client, nodeInfo.l1ContractAddresses.rollupAddress.toString());
      const gseAddress = await rollup.getGSE();

      const { address: newGovernanceProposerAddress } = await deployL1Contract(
        l1Client,
        NewGovernanceProposerPayloadAbi,
        NewGovernanceProposerPayloadBytecode,
        [nodeInfo.l1ContractAddresses.registryAddress.toString(), gseAddress!.toString()],
        { salt: '0x2a' },
      );
      expect(newGovernanceProposerAddress).toBeDefined();
      expect(newGovernanceProposerAddress.equals(EthAddress.ZERO)).toBeFalsy();
      debugLogger.info(`newGovernanceProposerAddress: ${newGovernanceProposerAddress.toString()}`);
      await updateSequencersConfig(config, {
        governanceProposerPayload: newGovernanceProposerAddress,
      });

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

      const l1TxUtils = createL1TxUtilsFromViemWallet(l1Client, { logger: debugLogger });
      const { receipt } = await governanceProposer.submitRoundWinner(executableRound, l1TxUtils);
      expect(receipt).toBeDefined();
      expect(receipt.status).toEqual('success');
      debugLogger.info(`Executed proposal ${info.round}`);
    },
    1000 * 60 * 10,
  );
});
