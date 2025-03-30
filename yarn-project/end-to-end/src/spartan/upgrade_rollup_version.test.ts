import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { type NodeInfo, type PXE, createCompatibleClient, retryUntil, sleep } from '@aztec/aztec.js';
import {
  GovernanceContract,
  GovernanceProposerContract,
  type L1ContractAddresses,
  L1TxUtils,
  RegistryContract,
  RollupContract,
  createEthereumChain,
  createL1Clients,
  defaultL1TxUtilsConfig,
  deployRollupForUpgrade,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { TestERC20Abi as FeeJuiceAbi } from '@aztec/l1-artifacts/TestERC20Abi';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { ChildProcess } from 'child_process';
import omit from 'lodash.omit';
import { getContract } from 'viem';
import { stringify } from 'viem/utils';

import { isK8sConfig, rollAztecPods, setupEnvironment, startPortForward, updateSequencersConfig } from './utils.js';

const config = setupEnvironment(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}

const debugLogger = createLogger('e2e:spartan-test:upgrade_rollup_version');

describe('spartan_upgrade_rollup_version', () => {
  let pxe: PXE;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOSTS: string[];
  let originalL1ContractAddresses: L1ContractAddresses;
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
    originalL1ContractAddresses = omit(nodeInfo.l1ContractAddresses, 'slashFactoryAddress');
  });

  // We need a separate account to deploy the new governance proposer
  // because the underlying validators are currently producing blob transactions
  // and you can't submit blob and non-blob transactions from the same account

  it(
    'should upgrade the rollup version',
    async () => {
      /** Helpers */
      const govInfo = async () => {
        const bn = await l1PublicClient.getBlockNumber();
        const slot = await rollup.getSlotNumber();
        const round = await governanceProposer.computeRound(slot);
        const info = await governanceProposer.getRoundInfo(originalL1ContractAddresses.rollupAddress.toString(), round);
        const leaderVotes = await governanceProposer.getProposalVotes(
          originalL1ContractAddresses.rollupAddress.toString(),
          round,
          info.leader,
        );
        return { bn, slot, round, info, leaderVotes };
      };

      /** Setup */

      const chain = createEthereumChain(ETHEREUM_HOSTS, nodeInfo.l1ChainId);
      const { walletClient: l1WalletClient, publicClient: l1PublicClient } = createL1Clients(
        ETHEREUM_HOSTS,
        config.L1_ACCOUNT_MNEMONIC,
        chain.chainInfo,
      );
      debugLogger.info(`l1WalletClient: ${l1WalletClient.account.address}`);
      const initialTestAccounts = await getInitialTestAccounts();

      const { genesisBlockHash, genesisArchiveRoot } = await getGenesisValues(initialTestAccounts.map(a => a.address));

      const { rollup: newRollup, payloadAddress } = await deployRollupForUpgrade(
        {
          walletClient: l1WalletClient,
          publicClient: l1PublicClient,
        },
        {
          salt: Math.floor(Math.random() * 1000000),
          vkTreeRoot: getVKTreeRoot(),
          protocolContractTreeRoot,
          l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice.toField(),
          genesisArchiveRoot,
          genesisBlockHash,
          ethereumSlotDuration: 12,
          aztecSlotDuration: 24,
          aztecEpochDuration: 4,
          aztecTargetCommitteeSize: 48,
          aztecProofSubmissionWindow: 8,
          minimumStake: BigInt(100e18),
          slashingQuorum: 6,
          slashingRoundSize: 10,
          governanceProposerQuorum: 6,
          governanceProposerRoundSize: 10,
          manaTarget: BigInt(100e6),
          provingCostPerMana: BigInt(100),
        },
        originalL1ContractAddresses.registryAddress,
        debugLogger,
        defaultL1TxUtilsConfig,
      );

      await updateSequencersConfig(config, {
        governanceProposerPayload: payloadAddress,
      });

      const rollup = new RollupContract(l1PublicClient, originalL1ContractAddresses.rollupAddress.toString());
      const governanceProposer = new GovernanceProposerContract(
        l1PublicClient,
        originalL1ContractAddresses.governanceProposerAddress.toString(),
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

      const l1TxUtils = new L1TxUtils(l1PublicClient, l1WalletClient, debugLogger);
      const { receipt, proposalId } = await governanceProposer.executeProposal(executableRound, l1TxUtils);
      expect(receipt).toBeDefined();
      expect(receipt.status).toEqual('success');
      debugLogger.info(`Executed proposal ${info.round}`, receipt);

      const addresses = await RegistryContract.collectAddresses(
        l1PublicClient,
        originalL1ContractAddresses.registryAddress,
        'canonical',
      );

      // Set up the primary voter
      const token = getContract({
        address: addresses.feeJuiceAddress.toString(),
        abi: FeeJuiceAbi,
        client: l1PublicClient,
      });

      const governance = new GovernanceContract(addresses.governanceAddress.toString(), l1PublicClient, l1WalletClient);
      const { minimumVotes: voteAmount } = await governance.getConfiguration();

      const mintTx = await token.write.mint([l1WalletClient.account.address, voteAmount], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: mintTx });

      const approveTx = await token.write.approve([addresses.governanceAddress.toString(), voteAmount], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: approveTx });

      await governance.deposit(l1WalletClient.account.address, voteAmount);

      await governance.awaitProposalActive({
        proposalId,
        logger: debugLogger,
      });

      // Vote for the proposal
      await governance.vote({
        proposalId,
        voteAmount,
        inFavor: true,
        retries: 10,
        logger: debugLogger,
      });

      // Wait for the proposal to be in the executable phase
      await governance.awaitProposalExecutable({
        proposalId,
        logger: debugLogger,
      });

      // Execute the proposal
      await governance.executeProposal({
        proposalId,
        retries: 10,
        logger: debugLogger,
      });

      const newAddresses = await newRollup.getRollupAddresses();

      const newCanonicalAddresses = await RegistryContract.collectAddresses(
        l1PublicClient,
        originalL1ContractAddresses.registryAddress,
        'canonical',
      );

      expect(newCanonicalAddresses).toEqual({
        // we preserve the original registry/governance addresses
        ...originalL1ContractAddresses,
        // but have new instance addresses
        ...newAddresses,
      });

      const oldVersion = await new RollupContract(
        l1PublicClient,
        originalL1ContractAddresses.rollupAddress.toString(),
      ).getVersion();
      const newVersion = await new RollupContract(
        l1PublicClient,
        newCanonicalAddresses.rollupAddress.toString(),
      ).getVersion();

      await expect(
        RegistryContract.collectAddresses(l1PublicClient, originalL1ContractAddresses.registryAddress, oldVersion),
      ).resolves.toEqual(newCanonicalAddresses);

      await expect(
        RegistryContract.collectAddresses(l1PublicClient, originalL1ContractAddresses.registryAddress, newVersion),
      ).resolves.toEqual(originalL1ContractAddresses);

      const oldRollupTips = await rollup.getTips();
      await retryUntil(
        async () => {
          const tips = await rollup.getTips();
          return tips.provenBlockNumber > oldRollupTips.provenBlockNumber;
        },
        'old rollup should be building blocks',
        // +5 just as a buffer
        (config.AZTEC_PROOF_SUBMISSION_WINDOW + 5) * config.AZTEC_SLOT_DURATION,
        5,
      );

      // Now delete all the pods, forcing them to restart on the new rollup
      await rollAztecPods(config.NAMESPACE);

      // start a new port forward
      const { process: pxeProcess, port: pxePort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
      });
      forwardProcesses.push(pxeProcess);
      const PXE_URL = `http://127.0.0.1:${pxePort}`;
      pxe = await createCompatibleClient(PXE_URL, debugLogger);

      const newNodeInfo = await pxe.getNodeInfo();
      expect(newNodeInfo.l1ContractAddresses.rollupAddress).toEqual(newCanonicalAddresses.rollupAddress);

      const l2Tips = await newRollup.getTips();
      await expect(
        retryUntil(
          async () => {
            const tips = await newRollup.getTips();
            return tips.provenBlockNumber > l2Tips.provenBlockNumber;
          },
          'new rollup should be building/proving blocks',
          // +5 just as a buffer
          (config.AZTEC_PROOF_SUBMISSION_WINDOW + 5) * config.AZTEC_SLOT_DURATION,
          5,
        ),
      ).resolves.toBe(true);
    },
    6 * config.AZTEC_PROOF_SUBMISSION_WINDOW * config.AZTEC_SLOT_DURATION * 1000,
  );
});
