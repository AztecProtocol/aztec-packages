import { type NodeInfo, type PXE, createCompatibleClient, sleep } from '@aztec/aztec.js';
import {
  GovernanceProposerContract,
  L1TxUtils,
  RegistryContract,
  RollupContract,
  createEthereumChain,
  createL1Clients,
  defaultL1TxUtilsConfig,
  deployRollupAndUpgradePayload,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { GovernanceAbi } from '@aztec/l1-artifacts/GovernanceAbi';
import { TestERC20Abi as FeeJuiceAbi } from '@aztec/l1-artifacts/TestERC20Abi';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import { getContract } from 'viem';
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

const debugLogger = createLogger('e2e:spartan-test:upgrade_rollup_version');

describe('spartan_upgrade_rollup_version', () => {
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

    const PXE_URL = `http://127.0.0.1:${config.HOST_PXE_PORT}`;
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
    nodeInfo = await pxe.getNodeInfo();
  });

  // We need a separate account to deploy the new governance proposer
  // because the underlying validators are currently producing blob transactions
  // and you can't submit blob and non-blob transactions from the same account
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
    return createL1Clients(ETHEREUM_HOST, account, chain.chainInfo);
  };

  it(
    'should upgrade the rollup version',
    async () => {
      /** Helpers */
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

      /** Setup */

      const { walletClient: l1WalletClient, publicClient: l1PublicClient } = await setupDeployerAccount();
      const chain = createEthereumChain(ETHEREUM_HOST, nodeInfo.l1ChainId);

      const { genesisBlockHash, genesisArchiveRoot } = await getGenesisValues([]);

      const { rollup: newRollup, payloadAddress } = await deployRollupAndUpgradePayload(
        ETHEREUM_HOST,
        chain.chainInfo,
        l1WalletClient.account,
        {
          salt: 2,
          vkTreeRoot: getVKTreeRoot(),
          protocolContractTreeRoot,
          l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
          genesisArchiveRoot,
          genesisBlockHash,
          ethereumSlotDuration: 12,
          aztecSlotDuration: 36,
          aztecEpochDuration: 32,
          aztecTargetCommitteeSize: 48,
          aztecProofSubmissionWindow: 64,
          minimumStake: BigInt(100e18),
          slashingQuorum: 6,
          slashingRoundSize: 10,
          governanceProposerQuorum: 6,
          governanceProposerRoundSize: 10,
        },
        nodeInfo.l1ContractAddresses.registryAddress,
        debugLogger,
        defaultL1TxUtilsConfig,
      );

      await updateSequencersConfig(config, {
        governanceProposerPayload: payloadAddress,
      });

      const rollup = new RollupContract(l1PublicClient, nodeInfo.l1ContractAddresses.rollupAddress.toString());
      const governanceProposer = new GovernanceProposerContract(
        l1PublicClient,
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

      const l1TxUtils = new L1TxUtils(l1PublicClient, l1WalletClient, debugLogger);
      const { receipt } = await governanceProposer.executeProposal(executableRound, l1TxUtils);
      expect(receipt).toBeDefined();
      expect(receipt.status).toEqual('success');
      debugLogger.info(`Executed proposal ${info.round}`);

      const addresses = await RegistryContract.collectAddresses(
        l1PublicClient,
        nodeInfo.l1ContractAddresses.registryAddress,
        'canonical',
      );

      // Set up the primary voter
      const token = getContract({
        address: addresses.feeJuiceAddress.toString(),
        abi: FeeJuiceAbi,
        client: l1PublicClient,
      });

      const governance = getContract({
        address: addresses.governanceAddress.toString(),
        abi: GovernanceAbi,
        client: l1PublicClient,
      });

      const voteAmount = 10_000n * 10n ** 18n;

      const mintTx = await token.write.mint([l1WalletClient.account.address, voteAmount], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: mintTx });

      const approveTx = await token.write.approve([addresses.governanceAddress.toString(), voteAmount], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: approveTx });

      const depositTx = await governance.write.deposit([l1WalletClient.account.address, voteAmount], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: depositTx });

      // Wait for the proposal to be in the voting phase
      let proposalState = await governance.read.getProposalState([0n]);
      expect(proposalState).toBeLessThan(2);
      debugLogger.info(`Got proposal state`, proposalState);
      while (proposalState !== 1) {
        await sleep(5000);
        debugLogger.info(`Waiting for proposal to be in the voting phase`);
        proposalState = await governance.read.getProposalState([0n]);
      }
      debugLogger.info(`Proposal is in the voting phase`);
      // Vote for the proposal
      const voteTx = await governance.write.vote([0n, voteAmount, true], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: voteTx });
      debugLogger.info(`Voted for the proposal`);

      // Wait for the proposal to be in the executable phase
      proposalState = await governance.read.getProposalState([0n]);
      while (proposalState !== 3) {
        await sleep(5000);
        debugLogger.info(`Waiting for proposal to be in the executable phase`);
        proposalState = await governance.read.getProposalState([0n]);
      }
      debugLogger.info(`Proposal is in the executable phase`);

      // Execute the proposal
      const executeTx = await governance.write.execute([0n], {
        account: l1WalletClient.account,
      });
      await l1PublicClient.waitForTransactionReceipt({ hash: executeTx });
      debugLogger.info(`Executed the proposal`);

      const newAddresses = await newRollup.getRollupAddresses();

      const newCanonicalAddresses = await RegistryContract.collectAddresses(
        l1PublicClient,
        nodeInfo.l1ContractAddresses.registryAddress,
        'canonical',
      );

      expect(newCanonicalAddresses).toEqual({
        ...nodeInfo.l1ContractAddresses,
        ...newAddresses,
      });

      await expect(
        RegistryContract.collectAddresses(l1PublicClient, nodeInfo.l1ContractAddresses.registryAddress, 2),
      ).resolves.toEqual(newCanonicalAddresses);

      await expect(
        RegistryContract.collectAddresses(l1PublicClient, nodeInfo.l1ContractAddresses.registryAddress, 1),
      ).resolves.toEqual(nodeInfo.l1ContractAddresses);
    },
    1000 * 60 * 30,
  );
});
