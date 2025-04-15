import { deployFundedSchnorrAccount, getInitialTestAccounts } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, sleep } from '@aztec/aztec.js';
import {
  type ExtendedViemWalletClient,
  L1TxUtils,
  RollupContract,
  defaultL1TxUtilsConfig,
  deployL1Contract,
  deployRollupForUpgrade,
} from '@aztec/ethereum';
import {
  GovernanceAbi,
  GovernanceProposerAbi,
  RegisterNewRollupVersionPayloadAbi,
  RegisterNewRollupVersionPayloadBytecode,
  RegistryAbi,
  TestERC20Abi as StakingAssetAbi,
  TestERC20Abi,
} from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getAddress, getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
// Note: these ports must be distinct from the other e2e tests, else the tests will
// interfere with each other.
const BOOT_NODE_UDP_PORT = 45000;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'add-rolluo-old-'));
const DATA_DIR_NEW = fs.mkdtempSync(path.join(os.tmpdir(), 'add-rolluo-new-'));

jest.setTimeout(1000 * 60 * 10);

/**
 * This test emulates the addition of a new rollup to the registry
 * The sequencers proposer, the proposal is executed and the new rollup is added to the registry
 * The nodes are then updated to use the new rollup and a tx is sent to the new rollup to see that it builds a block.
 */
describe('e2e_p2p_add_rollup', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let l1TxUtils: L1TxUtils;

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_add_rollup',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG,
        listenAddress: '127.0.0.1',
        governanceProposerQuorum: 6,
        governanceProposerRoundSize: 10,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();
    await t.removeInitialNode();

    l1TxUtils = new L1TxUtils(t.ctx.deployL1ContractsValues.publicClient, t.ctx.deployL1ContractsValues.walletClient);
  });

  afterAll(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('Should cast votes to add new rollup to registry', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const registry = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString()),
      abi: RegistryAbi,
      client: t.ctx.deployL1ContractsValues.publicClient,
    });

    const governanceProposer = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
      abi: GovernanceProposerAbi,
      client: t.ctx.deployL1ContractsValues.publicClient,
    });

    const roundSize = await governanceProposer.read.M();

    const governance = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceAddress.toString()),
      abi: GovernanceAbi,
      client: t.ctx.deployL1ContractsValues.publicClient,
    });

    const rollup = new RollupContract(
      t.ctx.deployL1ContractsValues!.publicClient,
      t.ctx.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
    );

    const emperor = t.ctx.deployL1ContractsValues.walletClient.account;

    const waitL1Block = async () => {
      await l1TxUtils.sendAndMonitorTransaction({
        to: emperor.address,
        value: 1n,
      });
    };

    const nextRoundTimestamp = await rollup.getTimestampForSlot(
      ((await rollup.getSlotNumber()) / roundSize) * roundSize + roundSize,
    );
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp));

    // Hand over the registry to the governance
    await t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({
      hash: await registry.write.transferOwnership([governance.address], { account: emperor }),
    });

    // Now that we have passed on the registry, we can deploy the new rollup.
    const initialTestAccounts = await getInitialTestAccounts();
    const { genesisBlockHash, genesisArchiveRoot, fundingNeeded, prefilledPublicData } = await getGenesisValues(
      initialTestAccounts.map(a => a.address),
    );
    const { rollup: newRollup } = await deployRollupForUpgrade(
      {
        walletClient: t.ctx.deployL1ContractsValues.walletClient as ExtendedViemWalletClient,
        publicClient: t.ctx.deployL1ContractsValues.publicClient,
      },
      {
        salt: Math.floor(Math.random() * 1000000),
        vkTreeRoot: getVKTreeRoot(),
        protocolContractTreeRoot,
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
        manaTarget: BigInt(100e10),
        provingCostPerMana: BigInt(100),
        feeJuicePortalInitialBalance: fundingNeeded,
      },
      t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress,
      t.logger,
      defaultL1TxUtilsConfig,
    );

    // Adding the attesters to the new rollup with a little cheating.
    {
      const attestersOnOld = await rollup.getAttesters();
      const oldContract = rollup.getContract();
      const newContract = newRollup.getContract();

      const attesterInfos = await Promise.all(
        attestersOnOld.map(async a => {
          const info = await oldContract.read.getInfo([a]);
          return { attester: a, proposer: info.proposer, withdrawer: info.withdrawer, amount: info.stake };
        }),
      );

      const stakingAsset = getContract({
        address: t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetAddress.toString(),
        abi: TestERC20Abi,
        client: t.ctx.deployL1ContractsValues.walletClient,
      });

      const stakeNeeded = attesterInfos.reduce((acc, curr) => acc + curr.amount, 0n);
      await Promise.all(
        [
          await stakingAsset.write.mint([emperor.address, stakeNeeded], {} as any),
          await stakingAsset.write.approve([newRollup.address, stakeNeeded], {} as any),
        ].map(txHash => t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: txHash })),
      );

      await t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({
        hash: await newContract.write.cheat__InitialiseValidatorSet([attesterInfos], { account: emperor }),
      });
    }

    const { address: newPayloadAddress } = await deployL1Contract(
      t.ctx.deployL1ContractsValues.walletClient,
      t.ctx.deployL1ContractsValues.publicClient,
      RegisterNewRollupVersionPayloadAbi,
      RegisterNewRollupVersionPayloadBytecode,
      [t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(), newRollup.address],
    );

    const govInfo = async () => {
      const bn = await t.ctx.cheatCodes.eth.blockNumber();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.read.computeRound([slot]);

      const info = await governanceProposer.read.rounds([
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
      ]);
      const leaderVotes = await governanceProposer.read.yeaCount([
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
        info[1],
      ]);
      t.logger.info(
        `Governance stats for round ${round} (Slot: ${slot}, BN: ${bn}). Leader: ${info[1]} have ${leaderVotes} votes`,
      );
      return { bn, slot, round, info, leaderVotes };
    };

    await waitL1Block();

    const govBefore = await govInfo();

    t.logger.info('Creating nodes');
    nodes = await createNodes(
      { ...t.ctx.aztecNodeConfig, governanceProposerPayload: newPayloadAddress },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      shouldCollectMetrics(),
    );

    await sleep(4000);

    t.logger.info('Start progressing time to cast votes');
    const quorumSize = await governanceProposer.read.N();
    t.logger.info(`Quorum size: ${quorumSize}, round size: ${await governanceProposer.read.M()}`);

    let govData;
    while (true) {
      govData = await govInfo();
      if (govData.leaderVotes >= quorumSize) {
        break;
      }
      await sleep(12000);
    }

    expect(govData.leaderVotes).toBeGreaterThan(govBefore.leaderVotes);

    const nextRoundTimestamp2 = await rollup.getTimestampForSlot(
      ((await rollup.getSlotNumber()) / roundSize) * roundSize + roundSize,
    );
    t.logger.info(`Warpping to ${nextRoundTimestamp2}`);
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp2));

    await waitL1Block();

    t.logger.info(`Executing proposal ${govData.round}`);
    const txHash = await governanceProposer.write.executeProposal([govData.round], {
      account: emperor,
      gas: 1_000_000n,
    });
    await t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: txHash });
    t.logger.info(`Executed proposal ${govData.round}`);

    const token = getContract({
      address: t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetAddress.toString(),
      abi: StakingAssetAbi,
      client: t.ctx.deployL1ContractsValues.walletClient,
    });

    t.logger.info(`Minting tokens`);

    await token.write.mint([emperor.address, 10000n * 10n ** 18n], { account: emperor });
    await token.write.approve([governance.address, 10000n * 10n ** 18n], { account: emperor });
    const depositTx = await governance.write.deposit([emperor.address, 10000n * 10n ** 18n], { account: emperor });
    await t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: depositTx });
    t.logger.info(`Deposited tokens`);

    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    t.logger.info(`Warping to ${timeToActive + 1n}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToActive + 1n));
    t.logger.info(`Warped to ${timeToActive + 1n}`);
    await waitL1Block();

    t.logger.info(`Voting`);
    const voteTx = await governance.write.vote([0n, 10000n * 10n ** 18n, true], { account: emperor });
    await t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: voteTx });
    t.logger.info(`Voted`);

    const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
    t.logger.info(`Warping to ${timeToExecutable}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToExecutable));
    t.logger.info(`Warped to ${timeToExecutable}`);
    await waitL1Block();

    const canonicalBefore = EthAddress.fromString(await registry.read.getCanonicalRollup());
    expect(canonicalBefore.equals(EthAddress.fromString(rollup.address))).toBe(true);
    t.logger.info(`Canonical rollup is correct`);
    t.logger.info(`Number of versions listed: ${await registry.read.numberOfVersions()}`);

    t.logger.info(`Executing proposal`);
    const executeTx = await governance.write.execute([0n], { account: emperor });
    await t.ctx.deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: executeTx });
    t.logger.info(`Executed proposal`);

    const canonicalAfter = EthAddress.fromString(await registry.read.getCanonicalRollup());
    expect(canonicalAfter.equals(EthAddress.fromString(newRollup.address))).toBe(true);
    t.logger.info(`Canonical rollup is correct`);
    t.logger.info(`Number of versions listed: ${await registry.read.numberOfVersions()}`);
    t.logger.info(`Old rollup: ${rollup.address}. New Rollup: ${newRollup.address}`);

    // stop all nodes
    for (let i = 0; i < NUM_NODES; i++) {
      const node = nodes[i];
      await node.stop();
      t.logger.info(`Node ${i} stopped`);
    }

    await sleep(2500);

    // Need to clear the bootnode, since it will otherwise provide stale data to the peers
    await t.bootstrapNode?.stop();
    await sleep(2500);

    await t.addBootstrapNode();
    await sleep(2500);

    const newVersion = await newRollup.getVersion();
    /*const addresses = await RegistryContract.collectAddresses(
      t.ctx.deployL1ContractsValues.publicClient,
      t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress,
      newVersion,
    );*/

    const newConfig = {
      ...t.ctx.aztecNodeConfig,
      rollupVersion: Number(newVersion),
      governanceProposerPayload: EthAddress.ZERO,
      // l1Contracts: { ...t.ctx.deployL1ContractsValues.l1ContractAddresses, ...addresses },
    };

    nodes = await createNodes(
      newConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      prefilledPublicData,
      DATA_DIR_NEW,
      shouldCollectMetrics(),
    );

    // Then we want to send a tx to the new rollup to just see that it can actually build a block!
    // wait a bit for peers to discover each other
    await sleep(4000);

    const pxeService = await createPXEService(nodes[0], { ...getPXEServiceConfig(), proverEnabled: false }, true);
    await deployFundedSchnorrAccount(pxeService, initialTestAccounts[0], undefined, undefined);

    const context = await createPXEServiceAndSubmitTransactions(t.logger, nodes[0], 1, initialTestAccounts[0]);

    await Promise.all(
      context.txs.map(async (tx, i) => {
        t.logger.info(`Waiting for tx ${i}: ${await tx.getTxHash()} to be mined`);
        return tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT });
      }),
    );

    // @todo We should really have been doing a briding transaction before and after, but atm we just want to see any kind of tx work.

    t.logger.info(`Mined tx ${await context.txs[0].getTxHash()}`);
    t.logger.info(`Old rollup block number: ${await rollup.getBlockNumber()}`);
    t.logger.info(`New rollup block number: ${await newRollup.getBlockNumber()}`);

    t.logger.info(`Attesters old: ${await rollup.getAttesters()}`);
    t.logger.info(`Attesters new: ${await newRollup.getAttesters()}`);
  }, 10_000_000);
});
