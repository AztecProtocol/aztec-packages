import { type InitialAccountData, getInitialTestAccountsData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { RollupCheatCodes } from '@aztec/aztec/testing';
import { FeeAssetHandlerContract, RegistryContract, RollupContract } from '@aztec/ethereum/contracts';
import { deployRollupForUpgrade } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { L1TxUtils, createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import {
  GovernanceAbi,
  GovernanceProposerAbi,
  OutboxAbi,
  RegisterNewRollupVersionPayloadAbi,
  RegisterNewRollupVersionPayloadBytecode,
  RegistryAbi,
} from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getPXEConfig } from '@aztec/pxe/server';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { getL2ToL1MessageLeafId } from '@aztec/stdlib/messaging';
import { getGenesisValues } from '@aztec/world-state/testing';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { type Hex, decodeEventLog, encodeFunctionData, getAddress, getContract } from 'viem';
import { foundry } from 'viem/chains';

import { shouldCollectMetrics } from '../../fixtures/fixtures.js';
import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import { ATTESTER_PRIVATE_KEYS_START_INDEX, createNodes, createProverNode } from '../../fixtures/setup_p2p_test.js';
import { setupSharedBlobStorage } from '../../fixtures/utils.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES } from '../../p2p/p2p_network.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'add-rollup-old-'));
const DATA_DIR_NEW = fs.mkdtempSync(path.join(os.tmpdir(), 'add-rollup-new-'));

jest.setTimeout(1000 * 60 * 20);

/**
 * This test emulates the addition of a new rollup to the registry and tests that cross-chain messages work.
 * Transactions are sent to the current rollup to check crosschain messages in both directions.
 * The sequencers proposer a proposal, the proposal is executed and the new rollup is added to the registry
 * The nodes are then updated to use the new rollup and we send transactions to try cross-chain in both directions
 * ensuring that it also works on the new rollup.
 *
 * Setup: P2PNetworkTest (real libp2p, 4 validator nodes + 1 prover node). SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES
 * (ethSlot=4s, aztecSlot=12s, proofSubEpochs=640) with governanceProposerRoundSize=10, minTxsPerBlock=0,
 * inboxLag=2. Full governance upgrade flow: validators signal a new rollup payload over real p2p, governance
 * vote executes, nodes migrate to the new rollup. Exercises L1→L2 (Inbox) and L2→L1 (Outbox) bridging on
 * both the old and new rollup.
 */
describe('multi-node/governance/add_rollup', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let proverAztecNode: AztecNodeService;
  let l1TxUtils: L1TxUtils;

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_add_rollup',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up`
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        listenAddress: '127.0.0.1',
        governanceProposerRoundSize: 10,
        // Allow validators to build empty checkpoints under pipelining so the chain keeps
        // advancing while we wait for L1->L2 messages to land in the next checkpoint's inbox tree.
        minTxsPerBlock: 0,
        // Pipelining starts cycle for checkpoint N+1 during slot N, but the inbox tree for
        // checkpoint N is only sealed when checkpoint N is published. inboxLag: 2 sources
        // L1->L2 messages from checkpoint N-1 (already sealed), avoiding L1ToL2MessagesNotReadyError.
        inboxLag: 2,
      },
      startProverNode: false, // Start one later using p2p.
    });

    await t.setup();
    await t.applyBaseSetup();
    await t.removeInitialNode();

    l1TxUtils = createL1TxUtils(t.ctx.deployL1ContractsValues.l1Client);
  });

  afterAll(async () => {
    await tryStop(proverAztecNode);
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  // Runs the full upgrade lifecycle: deploy a new rollup, have validators signal it over real p2p gossip,
  // reach governance quorum, execute the proposal, migrate all validator nodes to the new rollup, then
  // verify L1↔L2 cross-chain messaging works on both the old and new rollup.
  it('Should cast votes to add new rollup to registry', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    const registry = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString()),
      abi: RegistryAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const governanceProposer = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
      abi: GovernanceProposerAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const roundSize = await governanceProposer.read.ROUND_SIZE();

    const governance = getContract({
      address: getAddress(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceAddress.toString()),
      abi: GovernanceAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const rollup = new RollupContract(
      t.ctx.deployL1ContractsValues!.l1Client,
      t.ctx.deployL1ContractsValues!.l1ContractAddresses.rollupAddress,
    );

    const emperor = t.ctx.deployL1ContractsValues.l1Client.account;

    const waitL1Block = async () => {
      await l1TxUtils.sendAndMonitorTransaction({
        to: emperor.address,
        value: 1n,
      });
    };

    const currentSlot = await rollup.getSlotNumber();
    const nextRoundSlot = SlotNumber.fromBigInt((BigInt(currentSlot) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp = await rollup.getTimestampForSlot(nextRoundSlot);
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp));

    // Now that we have passed on the registry, we can deploy the new rollup.
    const initialTestAccounts = await getInitialTestAccountsData();
    const { genesisArchiveRoot, fundingNeeded, genesis } = await getGenesisValues(
      initialTestAccounts.map(a => a.address),
      undefined,
      undefined,
      t.ctx.genesis!.genesisTimestamp,
    );
    const { rollup: newRollup } = await deployRollupForUpgrade(
      t.baseAccountPrivateKey,
      t.ctx.aztecNodeConfig.l1RpcUrls[0],
      foundry.id,
      t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress,
      {
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash,
        genesisArchiveRoot,
        ethereumSlotDuration: t.ctx.aztecNodeConfig.ethereumSlotDuration,
        aztecSlotDuration: t.ctx.aztecNodeConfig.aztecSlotDuration,
        aztecEpochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
        aztecTargetCommitteeSize: t.ctx.aztecNodeConfig.aztecTargetCommitteeSize,
        lagInEpochsForValidatorSet: t.ctx.aztecNodeConfig.lagInEpochsForValidatorSet,
        lagInEpochsForRandao: t.ctx.aztecNodeConfig.lagInEpochsForRandao,
        inboxLag: t.ctx.aztecNodeConfig.inboxLag,
        aztecProofSubmissionEpochs: t.ctx.aztecNodeConfig.aztecProofSubmissionEpochs,
        slashingQuorum: t.ctx.aztecNodeConfig.slashingQuorum,
        slashingRoundSizeInEpochs: t.ctx.aztecNodeConfig.slashingRoundSizeInEpochs,
        slashingLifetimeInRounds: t.ctx.aztecNodeConfig.slashingLifetimeInRounds,
        slashingExecutionDelayInRounds: t.ctx.aztecNodeConfig.slashingExecutionDelayInRounds,
        slashingVetoer: t.ctx.aztecNodeConfig.slashingVetoer,
        slashingDisableDuration: t.ctx.aztecNodeConfig.slashingDisableDuration,
        manaTarget: t.ctx.aztecNodeConfig.manaTarget,
        provingCostPerMana: t.ctx.aztecNodeConfig.provingCostPerMana,
        initialEthPerFeeAsset: t.ctx.aztecNodeConfig.initialEthPerFeeAsset,
        feeJuicePortalInitialBalance: fundingNeeded,
        realVerifier: false,
        exitDelaySeconds: t.ctx.aztecNodeConfig.exitDelaySeconds,
        slasherEnabled: t.ctx.aztecNodeConfig.slasherEnabled,
        slashingOffsetInRounds: t.ctx.aztecNodeConfig.slashingOffsetInRounds,
        slashAmountSmall: t.ctx.aztecNodeConfig.slashAmountSmall,
        slashAmountMedium: t.ctx.aztecNodeConfig.slashAmountMedium,
        slashAmountLarge: t.ctx.aztecNodeConfig.slashAmountLarge,
        localEjectionThreshold: t.ctx.aztecNodeConfig.localEjectionThreshold,
        governanceVotingDuration: t.ctx.aztecNodeConfig.governanceVotingDuration,
      },
    );

    // Fund the new rollup's FeeJuicePortal using the feeAssetHandler.
    // This is needed because after initial deployment, the fee asset's owner is transferred to coinIssuer,
    // so the deployRollupForUpgrade script can't mint tokens directly to the new portal.
    const newFeeJuicePortalAddress = await newRollup.getFeeJuicePortal();
    const feeAssetHandler = new FeeAssetHandlerContract(
      t.ctx.deployL1ContractsValues.l1Client,
      t.ctx.deployL1ContractsValues.l1ContractAddresses.feeAssetHandlerAddress!,
    );
    t.logger.info(`Fund the new FeeJuicePortal at ${newFeeJuicePortalAddress}`);
    await feeAssetHandler.setMintAmount(l1TxUtils, fundingNeeded);
    await feeAssetHandler.mint(l1TxUtils, newFeeJuicePortalAddress);

    const { address: newPayloadAddress } = await deployL1Contract(
      t.ctx.deployL1ContractsValues.l1Client,
      RegisterNewRollupVersionPayloadAbi,
      RegisterNewRollupVersionPayloadBytecode,
      [t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(), newRollup.address],
    );

    const govInfo = async () => {
      const bn = await t.ctx.cheatCodes.eth.blockNumber();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.read.computeRound([BigInt(slot)]);

      const info = await governanceProposer.read.getRoundData([
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
      ]);
      const leaderVotes = await governanceProposer.read.signalCount([
        t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
        info.payloadWithMostSignals,
      ]);
      t.logger.info(
        `Governance stats for round ${round} (Slot: ${slot}, BN: ${bn}). Leader: ${info.payloadWithMostSignals} have ${leaderVotes} signals`,
      );
      return { bn, slot, round, info, leaderVotes };
    };

    await waitL1Block();

    t.logger.info('Creating nodes');
    // REFACTOR: sleep(4000) below is a hand-rolled connectivity wait; replace with t.waitForP2PMeshConnectivity
    nodes = await createNodes(
      { ...t.ctx.aztecNodeConfig, governanceProposerPayload: newPayloadAddress },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      shouldCollectMetrics(),
    );

    // create a prover node that uses p2p only (not rpc) to gather txs to test prover tx collection
    t.logger.warn(`Creating prover node`);
    ({ proverNode: proverAztecNode } = await createProverNode(
      t.ctx.aztecNodeConfig,
      BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
      t.bootstrapNodeEnr,
      ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
      { dateProvider: t.ctx.dateProvider },
      t.genesis,
      `${DATA_DIR}-prover`,
      shouldCollectMetrics(),
    ));

    await sleep(4000);

    t.logger.info('Start progressing time to cast votes');
    const quorumSize = await governanceProposer.read.QUORUM_SIZE();
    t.logger.info(`Quorum size: ${quorumSize}, round size: ${await governanceProposer.read.ROUND_SIZE()}`);

    const bridging = async (
      node: AztecNodeService,
      aliceAccount: InitialAccountData,
      l1Client: ExtendedViemWalletClient,
      l1ContractAddresses: L1ContractAddresses,
      rollupVersion: bigint,
      l1RpcUrls: string[],
    ) => {
      // Bridge assets into the rollup, and consume the message.
      // We are doing some of the things that are in the crosschain harness, but we don't actually want the full thing
      const wallet = await TestWallet.create(
        node,
        // Use checkpointed chain tip to avoid anchoring on provisional blocks that the archiver can prune
        // when their slot ends without a checkpoint landing on L1.
        { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
        { loggerActorLabel: 'pxe-bridge' },
      );
      const aliceAccountManager = await wallet.createSchnorrInitializerlessAccount(
        aliceAccount.secret,
        aliceAccount.salt,
      );

      const aliceAddress = aliceAccountManager.address;

      const { contract: testContract } = await TestContract.deploy(wallet).send({ from: aliceAddress });

      const [secret, secretHash] = await generateClaimSecret();

      const contentIntoRollup = Fr.random();
      const contentOutFromRollup = Fr.random();

      const ethRecipient = EthAddress.fromString(l1Client.account.address);

      const message = { recipient: testContract.address, content: contentIntoRollup, secretHash };
      const { msgHash: message1Hash, globalLeafIndex: actualMessage1Index } = await sendL1ToL2Message(message, {
        l1Client,
        l1ContractAddresses,
      });

      const makeMessageConsumable = async (msgHash: Fr) => {
        // Wait until the message is ready to be consumed (the rollup has reached the message's checkpoint).
        // Using waitForL1ToL2MessageReady rather than isL1ToL2MessageSynced because with `inboxLag > 0`
        // a synced message is not yet present in the latest checkpoint's inbox tree.
        await waitForL1ToL2MessageReady(node, msgHash, { timeoutSeconds: 120 });

        const { receipt } = await testContract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(contentOutFromRollup, ethRecipient)
          .send({ from: aliceAddress });

        await testContract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(contentOutFromRollup, ethRecipient)
          .send({ from: aliceAddress });

        return receipt;
      };

      const l2OutgoingReceipt = await makeMessageConsumable(message1Hash);

      // Then we finish up the L1 -> L2 message
      const [message1Index] = (await node.getL1ToL2MessageMembershipWitness('latest', message1Hash))!;
      expect(actualMessage1Index.toBigInt()).toBe(message1Index);

      await testContract.methods
        .consume_message_from_arbitrary_sender_private(message.content, secret, ethRecipient, message1Index)
        .send({ from: aliceAddress });

      // Then we consume the L2 -> L1 message
      {
        const l2ToL1Message = {
          sender: {
            actor: testContract.address.toString() as Hex,
            version: BigInt(rollupVersion),
          },
          recipient: {
            actor: ethRecipient.toString() as Hex,
            chainId: BigInt(l1Client.chain.id),
          },
          content: contentOutFromRollup.toString() as Hex,
        };

        const leaf = computeL2ToL1MessageHash({
          l2Sender: testContract.address,
          l1Recipient: ethRecipient,
          content: contentOutFromRollup,
          rollupVersion: new Fr(rollupVersion),
          chainId: new Fr(l1Client.chain.id),
        });

        // We need to advance to the next epoch so that the out hash will be set to outbox when the epoch is proven.
        const cheatcodes = RollupCheatCodes.create(l1RpcUrls, l1ContractAddresses, t.ctx.dateProvider);
        const minedReceipt = await node.getTxReceipt(l2OutgoingReceipt.txHash);
        if (minedReceipt.epochNumber === undefined) {
          throw new Error('Outgoing tx is not yet in an epoch');
        }
        await cheatcodes.advanceToEpoch(EpochNumber(minedReceipt.epochNumber + 1));
        await waitForProven(node, l2OutgoingReceipt, { provenTimeout: 300 });

        const l2ToL1MessageResult = await retryUntil(
          () => node.getL2ToL1MembershipWitness(minedReceipt.txHash, leaf),
          'l2 to l1 membership witness',
          60,
          1,
        );
        const { epochNumber: epoch, numCheckpointsInEpoch, ...l2ToL1MessageWitness } = l2ToL1MessageResult;
        const leafId = getL2ToL1MessageLeafId(l2ToL1MessageWitness);

        // Then we want to go and comsume it!
        const outbox = getContract({
          address: l1ContractAddresses.outboxAddress.toString(),
          abi: OutboxAbi,
          client: l1Client,
        });

        const { receipt: txReceipt } = await l1TxUtils.sendAndMonitorTransaction({
          to: outbox.address,
          data: encodeFunctionData({
            abi: OutboxAbi,
            functionName: 'consume',
            args: [
              l2ToL1Message,
              BigInt(epoch),
              BigInt(numCheckpointsInEpoch),
              BigInt(l2ToL1MessageWitness.leafIndex),
              l2ToL1MessageWitness.siblingPath
                .toBufferArray()
                .map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
            ],
          }),
        });

        // Exactly 1 event should be emitted in the transaction
        expect(txReceipt.logs.length).toBe(1);

        // We decode the event log before checking it
        const txLog = txReceipt.logs[0];
        const topics = decodeEventLog({
          abi: OutboxAbi,
          data: txLog.data,
          topics: txLog.topics,
        }) as {
          eventName: 'MessageConsumed';
          args: {
            epoch: bigint;
            root: `0x${string}`;
            messageHash: `0x${string}`;
            leafId: bigint;
            numCheckpointsInEpoch: bigint;
          };
        };

        // We check that MessageConsumed event was emitted with the expected message hash and leaf id
        expect(topics.args.messageHash).toStrictEqual(leaf.toString());
        expect(topics.args.leafId).toStrictEqual(leafId);
      }
    };

    await bridging(
      nodes[0],
      t.ctx.additionallyFundedAccounts[0],
      t.ctx.deployL1ContractsValues.l1Client,
      t.ctx.deployL1ContractsValues.l1ContractAddresses,
      BigInt(t.ctx.aztecNodeConfig.rollupVersion),
      t.ctx.aztecNodeConfig.l1RpcUrls,
    );

    // REFACTOR: while(true) polling loop with sleep is hand-rolled; replace with retryUntil
    let govData;
    while (true) {
      govData = await govInfo();
      if (govData.leaderVotes >= quorumSize) {
        break;
      }
      await sleep(t.ctx.aztecNodeConfig.ethereumSlotDuration * t.ctx.aztecNodeConfig.aztecSlotDuration * 1000);
    }

    const currentSlot2 = await rollup.getSlotNumber();
    const nextRoundSlot2 = SlotNumber.fromBigInt((BigInt(currentSlot2) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp2 = await rollup.getTimestampForSlot(nextRoundSlot2);
    t.logger.info(`Warpping to ${nextRoundTimestamp2}`);
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp2));

    await waitL1Block();

    t.logger.info(`Executing proposal ${govData.round}`);

    await l1TxUtils.sendAndMonitorTransaction({
      to: governanceProposer.address,
      data: encodeFunctionData({
        abi: GovernanceProposerAbi,
        functionName: 'submitRoundWinner',
        args: [govData.round],
      }),
    });
    t.logger.info(`Submitted winner for round ${govData.round}`);

    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    t.logger.info(`Warping to ${timeToActive + 1n}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToActive + 1n));
    t.logger.info(`Warped to ${timeToActive + 1n}`);
    await waitL1Block();

    t.logger.info(`Voting`);
    await rollup.vote(l1TxUtils, 0n);
    t.logger.info(`Voted`);

    const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
    t.logger.info(`Warping to ${timeToExecutable}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToExecutable));
    t.logger.info(`Warped to ${timeToExecutable}`);
    await waitL1Block();

    const canonicalBefore = EthAddress.fromString(await registry.read.getCanonicalRollup());
    expect(canonicalBefore.equals(EthAddress.fromString(rollup.address))).toBe(true);
    t.logger.info(`Canonical rollup is correct`);
    const numberOfVersionsBefore = await registry.read.numberOfVersions();
    t.logger.info(`Number of versions listed: ${numberOfVersionsBefore}`);
    const attestersBeforeOld = await rollup.getAttesters();
    const attestersBeforeNew = await newRollup.getAttesters();

    t.logger.info(`Executing proposal`);
    await l1TxUtils.sendAndMonitorTransaction({
      to: governance.address,
      data: encodeFunctionData({
        abi: GovernanceAbi,
        functionName: 'execute',
        args: [0n],
      }),
    });
    t.logger.info(`Executed proposal`);

    const canonicalAfter = EthAddress.fromString(await registry.read.getCanonicalRollup());
    expect(canonicalAfter.equals(EthAddress.fromString(newRollup.address))).toBe(true);
    const numberOfVersionsAfter = await registry.read.numberOfVersions();
    expect(numberOfVersionsAfter).toBe(numberOfVersionsBefore + 1n);
    t.logger.info(`Canonical rollup is correct`);
    t.logger.info(`Number of versions listed: ${numberOfVersionsAfter}`);
    t.logger.info(`Old rollup: ${rollup.address}. New Rollup: ${newRollup.address}`);

    const attestersAfterOld = await rollup.getAttesters();
    const attestersAfterNew = await newRollup.getAttesters();
    t.logger.info(
      `Attesters old before: ${attestersBeforeOld.length}. Attesters old after: ${attestersAfterOld.length}`,
    );
    t.logger.info(
      `Attesters new before: ${attestersBeforeNew.length}. Attesters new after: ${attestersAfterNew.length}`,
    );

    // Stop the prover aztec node (which stops the prover subsystem).
    await proverAztecNode.stop();

    // stop all nodes
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      const node = nodes[i];
      await node.stop();
      t.logger.info(`Node ${i} stopped`);
    }

    await sleep(2500);

    // Need to clear the bootnode, since it will otherwise provide stale data to the peers
    await t.bootstrapNode?.stop();
    await sleep(2500);

    // With all down, we make a time jump such that we ensure that we will be at a point where epochs are non-empty
    // This is to avoid conflicts when the checkpoints are looking further back.
    const futureEpoch = EpochNumber.fromBigInt(500n + BigInt(await newRollup.getCurrentEpochNumber()));
    const futureSlot = SlotNumber.fromBigInt(BigInt(futureEpoch) * BigInt(t.ctx.aztecNodeConfig.aztecEpochDuration));
    const time = await newRollup.getTimestampForSlot(futureSlot);
    if (time > BigInt(await t.ctx.cheatCodes.eth.lastBlockTimestamp())) {
      await t.ctx.cheatCodes.eth.warp(Number(time));
      await waitL1Block();
    }

    await t.addBootstrapNode();
    await sleep(2500);

    const newVersion = await newRollup.getVersion();
    const addresses = await RegistryContract.collectAddresses(
      t.ctx.deployL1ContractsValues.l1Client,
      t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress,
      newVersion,
    );

    // Set up shared blob storage for the new rollup using FileStore
    const newConfig = {
      ...t.ctx.aztecNodeConfig,
      dataDirectory: DATA_DIR_NEW,
      rollupVersion: Number(newVersion),
      governanceProposerPayload: EthAddress.ZERO,
      l1Contracts: { ...t.ctx.deployL1ContractsValues.l1ContractAddresses, ...addresses },
    };
    await setupSharedBlobStorage(newConfig);

    await sleep(4000);

    nodes = await createNodes(
      newConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      genesis,
      DATA_DIR_NEW,
      shouldCollectMetrics(),
    );

    t.logger.warn(`Creating new prover node`);
    ({ proverNode: proverAztecNode } = await createProverNode(
      newConfig,
      BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
      t.bootstrapNodeEnr,
      ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
      { dateProvider: t.ctx.dateProvider },
      genesis,
      `${DATA_DIR_NEW}-prover`,
      shouldCollectMetrics(),
    ));

    // wait a bit for peers to discover each other
    await sleep(4000);

    // The new rollup should have no checkpoints
    expect(await newRollup.getCheckpointNumber()).toBe(CheckpointNumber(0));

    // Wait for the new rollup to publish its first checkpoint AND for `nodes[0]` to have synced
    // it locally, before the second bridging step. The bridge wallet uses
    // `syncChainTip: 'checkpointed'`, which falls back to the genesis block when no checkpoint
    // exists. After warping ~500 epochs forward, txs anchored at genesis would expire before
    // being included. We poll the node's local view (not just the L1 rollup contract) so the PXE
    // and the assertion observe the same chain state.
    t.logger.info(`Waiting for new rollup to publish its first checkpoint`);
    await retryUntil(
      async () => Number(await nodes[0].getCheckpointNumber('checkpointed')) > 0,
      'newRollup first checkpoint synced by node',
      300,
      2,
    );
    t.logger.info(`New rollup published its first checkpoint`);

    // Bridge into and out of the new rollup to ensure that it works.
    await bridging(
      nodes[0],
      initialTestAccounts[0],
      t.ctx.deployL1ContractsValues.l1Client,
      newConfig.l1Contracts,
      BigInt(newConfig.rollupVersion),
      newConfig.l1RpcUrls,
    );

    // Both rollups should have a checkpoint number greater than 0
    expect(await rollup.getCheckpointNumber()).toBeGreaterThan(CheckpointNumber(0));
    expect(await newRollup.getCheckpointNumber()).toBeGreaterThan(CheckpointNumber(0));
  }, 10_000_000);
});
