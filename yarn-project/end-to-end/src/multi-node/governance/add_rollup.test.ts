import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
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
import { getL2ToL1MessageLeafId } from '@aztec/stdlib/messaging';
import { getGenesisValues } from '@aztec/world-state/testing';

import { type Hex, decodeEventLog, encodeFunctionData, getAddress, getContract } from 'viem';
import { foundry } from 'viem/chains';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import { getPrivateKeyFromIndex, getSponsoredFPCAddress } from '../../fixtures/utils.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';
import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MultiNodeTestContext,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { GOVERNANCE_TIMING, jest } from './setup.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_VALIDATORS = 4;

jest.setTimeout(1000 * 60 * 20);

/**
 * This test emulates the addition of a new rollup to the registry and tests that cross-chain messages work.
 * Transactions are sent to the current rollup to check crosschain messages in both directions.
 * The sequencers propose a proposal, the proposal is executed and the new rollup is added to the registry.
 * The nodes are then migrated to the new rollup and we send transactions to try cross-chain in both directions,
 * ensuring that it also works on the new rollup.
 *
 * Setup: MultiNodeTestContext on the in-memory mock-gossip bus (no real libp2p, no bootstrap/discovery).
 * GOVERNANCE_TIMING (ethSlot=4s, aztecSlot=12s, proofSubEpochs=640) with governanceProposerRoundSize=10,
 * minTxsPerBlock=0, inboxLag=2. 4 validator nodes plus one fake-proof prover node, all attached to the
 * shared `MockGossipSubNetwork`. Full governance upgrade flow: validators signal a new rollup payload over
 * mock gossip, governance vote executes, nodes migrate to the new rollup. Exercises L1->L2 (Inbox) and
 * L2->L1 (Outbox) bridging on both the old and new rollup.
 *
 * Migration on the mock bus: there is no bootstrap node or peer discovery to flush, so the original
 * real-libp2p restart dance (stop bootstrap node, re-add it, let new peers rediscover) collapses to
 * "stop the old nodes/prover, warp, spawn new nodes/prover on the new rollup config" — the new nodes
 * simply re-attach to the same in-memory bus. The new rollup is deployed with the same genesis as the
 * context (same funded accounts + timestamp) so its archive root matches the genesis the fake prover and
 * validator nodes already run, letting the prover prove the new rollup's checkpoints.
 */
describe('multi-node/governance/add_rollup', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];
  let proverAztecNode: AztecNodeService;
  let l1TxUtils: L1TxUtils;
  let fundedAccounts: InitialAccountData[];
  // Anvil index-1 account, funded out of the box, used to deploy the new rollup.
  const deployerPrivateKey = `0x${getPrivateKeyFromIndex(1)!.toString('hex')}` as const;

  beforeAll(async () => {
    fundedAccounts = await generateSchnorrAccounts(2);

    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      ...GOVERNANCE_TIMING,
      listenAddress: '127.0.0.1',
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      governanceProposerRoundSize: 10,
      // Allow validators to build empty checkpoints so the chain keeps advancing while we wait for
      // L1->L2 messages to land in the next checkpoint's inbox tree.
      minTxsPerBlock: 0,
      // inboxLag: 2 sources L1->L2 messages from an already-sealed checkpoint under pipelining, avoiding
      // L1ToL2MessagesNotReadyError.
      inboxLag: 2,
      // Fund the bridging accounts (and the sponsored FPC) at genesis. Skip the hardcoded-account
      // fast-path so our additionallyFundedAccounts are not clobbered.
      skipHardcodedAccount: true,
      additionallyFundedAccounts: fundedAccounts,
      fundSponsoredFPC: true,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });

    l1TxUtils = createL1TxUtils(test.context.deployL1ContractsValues.l1Client);
  });

  afterAll(async () => {
    await test.teardown();
  });

  it('Should cast votes to add new rollup to registry', async () => {
    const { context, logger } = test;

    const registry = getContract({
      address: getAddress(context.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString()),
      abi: RegistryAbi,
      client: context.deployL1ContractsValues.l1Client,
    });

    const governanceProposer = getContract({
      address: getAddress(context.deployL1ContractsValues.l1ContractAddresses.governanceProposerAddress.toString()),
      abi: GovernanceProposerAbi,
      client: context.deployL1ContractsValues.l1Client,
    });

    const roundSize = await governanceProposer.read.ROUND_SIZE();

    const governance = getContract({
      address: getAddress(context.deployL1ContractsValues.l1ContractAddresses.governanceAddress.toString()),
      abi: GovernanceAbi,
      client: context.deployL1ContractsValues.l1Client,
    });

    const rollup = new RollupContract(
      context.deployL1ContractsValues.l1Client,
      context.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
    );

    const emperor = context.deployL1ContractsValues.l1Client.account;

    const waitL1Block = async () => {
      await l1TxUtils.sendAndMonitorTransaction({
        to: emperor.address,
        value: 1n,
      });
    };

    const currentSlot = await rollup.getSlotNumber();
    const nextRoundSlot = SlotNumber.fromBigInt((BigInt(currentSlot) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp = await rollup.getTimestampForSlot(nextRoundSlot);
    await context.cheatCodes.eth.warp(Number(nextRoundTimestamp));

    // Build the new rollup's genesis from the same funded-account set the context used (the additionally
    // funded accounts plus the sponsored FPC), so the second bridging step can fund `fundedAccounts[1]`.
    // The new rollup's on-chain version is `uint32(keccak256(abi.encode(config, genesisState)))`, so its
    // genesisArchiveRoot MUST differ from the context's primary rollup, otherwise `Registry.addRollup`
    // reverts with `Registry__RollupAlreadyRegistered` (the version collides) and the governance proposal
    // fails to execute. We offset the genesis timestamp by 1s, which changes the archive root (and thus the
    // version) without altering the funded set. The migrated nodes/prover are repointed at this genesis
    // (see `test.context.genesis = newGenesis` below) so the fake prover can still prove its checkpoints.
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const genesisFundedAddresses = [...fundedAccounts.map(a => a.address), sponsoredFPCAddress];
    const {
      genesisArchiveRoot,
      fundingNeeded,
      genesis: newGenesis,
    } = await getGenesisValues(genesisFundedAddresses, undefined, undefined, context.genesis!.genesisTimestamp + 1n);

    const { rollup: newRollup } = await deployRollupForUpgrade(
      deployerPrivateKey,
      context.aztecNodeConfig.l1RpcUrls[0],
      foundry.id,
      context.deployL1ContractsValues.l1ContractAddresses.registryAddress,
      {
        vkTreeRoot: getVKTreeRoot(),
        protocolContractsHash,
        genesisArchiveRoot,
        ethereumSlotDuration: context.aztecNodeConfig.ethereumSlotDuration,
        aztecSlotDuration: context.aztecNodeConfig.aztecSlotDuration,
        aztecEpochDuration: context.aztecNodeConfig.aztecEpochDuration,
        aztecTargetCommitteeSize: context.aztecNodeConfig.aztecTargetCommitteeSize,
        lagInEpochsForValidatorSet: context.aztecNodeConfig.lagInEpochsForValidatorSet,
        lagInEpochsForRandao: context.aztecNodeConfig.lagInEpochsForRandao,
        inboxLag: context.aztecNodeConfig.inboxLag,
        aztecProofSubmissionEpochs: context.aztecNodeConfig.aztecProofSubmissionEpochs,
        slashingQuorum: context.aztecNodeConfig.slashingQuorum,
        slashingRoundSizeInEpochs: context.aztecNodeConfig.slashingRoundSizeInEpochs,
        slashingLifetimeInRounds: context.aztecNodeConfig.slashingLifetimeInRounds,
        slashingExecutionDelayInRounds: context.aztecNodeConfig.slashingExecutionDelayInRounds,
        slashingVetoer: context.aztecNodeConfig.slashingVetoer,
        slashingDisableDuration: context.aztecNodeConfig.slashingDisableDuration,
        manaTarget: context.aztecNodeConfig.manaTarget,
        provingCostPerMana: context.aztecNodeConfig.provingCostPerMana,
        initialEthPerFeeAsset: context.aztecNodeConfig.initialEthPerFeeAsset,
        feeJuicePortalInitialBalance: fundingNeeded,
        realVerifier: false,
        exitDelaySeconds: context.aztecNodeConfig.exitDelaySeconds,
        slasherEnabled: context.aztecNodeConfig.slasherEnabled,
        slashingOffsetInRounds: context.aztecNodeConfig.slashingOffsetInRounds,
        slashAmountSmall: context.aztecNodeConfig.slashAmountSmall,
        slashAmountMedium: context.aztecNodeConfig.slashAmountMedium,
        slashAmountLarge: context.aztecNodeConfig.slashAmountLarge,
        localEjectionThreshold: context.aztecNodeConfig.localEjectionThreshold,
        governanceVotingDuration: context.aztecNodeConfig.governanceVotingDuration,
      },
    );

    // Fund the new rollup's FeeJuicePortal using the feeAssetHandler.
    // This is needed because after initial deployment, the fee asset's owner is transferred to coinIssuer,
    // so the deployRollupForUpgrade script can't mint tokens directly to the new portal.
    const newFeeJuicePortalAddress = await newRollup.getFeeJuicePortal();
    const feeAssetHandler = new FeeAssetHandlerContract(
      context.deployL1ContractsValues.l1Client,
      context.deployL1ContractsValues.l1ContractAddresses.feeAssetHandlerAddress!,
    );
    logger.info(`Fund the new FeeJuicePortal at ${newFeeJuicePortalAddress}`);
    await feeAssetHandler.setMintAmount(l1TxUtils, fundingNeeded);
    await feeAssetHandler.mint(l1TxUtils, newFeeJuicePortalAddress);

    const { address: newPayloadAddress } = await deployL1Contract(
      context.deployL1ContractsValues.l1Client,
      RegisterNewRollupVersionPayloadAbi,
      RegisterNewRollupVersionPayloadBytecode,
      [context.deployL1ContractsValues.l1ContractAddresses.registryAddress.toString(), newRollup.address],
    );

    const govInfo = async () => {
      const bn = await context.cheatCodes.eth.blockNumber();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.read.computeRound([BigInt(slot)]);

      const info = await governanceProposer.read.getRoundData([
        context.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
      ]);
      const leaderVotes = await governanceProposer.read.signalCount([
        context.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
        round,
        info.payloadWithMostSignals,
      ]);
      logger.info(
        `Governance stats for round ${round} (Slot: ${slot}, BN: ${bn}). Leader: ${info.payloadWithMostSignals} have ${leaderVotes} signals`,
      );
      return { bn, slot, round, info, leaderVotes };
    };

    await waitL1Block();

    logger.info('Creating nodes');
    nodes = await Promise.all(
      Array.from({ length: NUM_VALIDATORS }, (_, i) =>
        test.createValidatorNodeAt(i, { governanceProposerPayload: newPayloadAddress }),
      ),
    );

    // Create a prover node attached to the mock-gossip bus to gather txs and prove the chain.
    logger.warn(`Creating prover node`);
    proverAztecNode = await test.createProverNode();

    await sleep(4000);

    logger.info('Start progressing time to cast votes');
    const quorumSize = await governanceProposer.read.QUORUM_SIZE();
    logger.info(`Quorum size: ${quorumSize}, round size: ${await governanceProposer.read.ROUND_SIZE()}`);

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
        const cheatcodes = RollupCheatCodes.create(l1RpcUrls, l1ContractAddresses, context.dateProvider);
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
      fundedAccounts[0],
      context.deployL1ContractsValues.l1Client,
      context.deployL1ContractsValues.l1ContractAddresses,
      BigInt(context.aztecNodeConfig.rollupVersion),
      context.aztecNodeConfig.l1RpcUrls,
    );

    // REFACTOR: while(true) polling loop with sleep is hand-rolled; replace with retryUntil
    let govData;
    while (true) {
      govData = await govInfo();
      if (govData.leaderVotes >= quorumSize) {
        break;
      }
      await sleep(context.aztecNodeConfig.ethereumSlotDuration * context.aztecNodeConfig.aztecSlotDuration * 1000);
    }

    const currentSlot2 = await rollup.getSlotNumber();
    const nextRoundSlot2 = SlotNumber.fromBigInt((BigInt(currentSlot2) / roundSize) * roundSize + roundSize);
    const nextRoundTimestamp2 = await rollup.getTimestampForSlot(nextRoundSlot2);
    logger.info(`Warpping to ${nextRoundTimestamp2}`);
    await context.cheatCodes.eth.warp(Number(nextRoundTimestamp2));

    await waitL1Block();

    logger.info(`Executing proposal ${govData.round}`);

    await l1TxUtils.sendAndMonitorTransaction({
      to: governanceProposer.address,
      data: encodeFunctionData({
        abi: GovernanceProposerAbi,
        functionName: 'submitRoundWinner',
        args: [govData.round],
      }),
    });
    logger.info(`Submitted winner for round ${govData.round}`);

    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    logger.info(`Warping to ${timeToActive + 1n}`);
    await context.cheatCodes.eth.warp(Number(timeToActive + 1n));
    logger.info(`Warped to ${timeToActive + 1n}`);
    await waitL1Block();

    logger.info(`Voting`);
    await rollup.vote(l1TxUtils, 0n);
    logger.info(`Voted`);

    const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
    logger.info(`Warping to ${timeToExecutable}`);
    await context.cheatCodes.eth.warp(Number(timeToExecutable));
    logger.info(`Warped to ${timeToExecutable}`);
    await waitL1Block();

    const canonicalBefore = EthAddress.fromString(await registry.read.getCanonicalRollup());
    expect(canonicalBefore.equals(EthAddress.fromString(rollup.address))).toBe(true);
    logger.info(`Canonical rollup is correct`);
    const numberOfVersionsBefore = await registry.read.numberOfVersions();
    logger.info(`Number of versions listed: ${numberOfVersionsBefore}`);
    const attestersBeforeOld = await rollup.getAttesters();
    const attestersBeforeNew = await newRollup.getAttesters();

    logger.info(`Executing proposal`);
    await l1TxUtils.sendAndMonitorTransaction({
      to: governance.address,
      data: encodeFunctionData({
        abi: GovernanceAbi,
        functionName: 'execute',
        args: [0n],
      }),
    });
    logger.info(`Executed proposal`);

    const canonicalAfter = EthAddress.fromString(await registry.read.getCanonicalRollup());
    expect(canonicalAfter.equals(EthAddress.fromString(newRollup.address))).toBe(true);
    const numberOfVersionsAfter = await registry.read.numberOfVersions();
    expect(numberOfVersionsAfter).toBe(numberOfVersionsBefore + 1n);
    logger.info(`Canonical rollup is correct`);
    logger.info(`Number of versions listed: ${numberOfVersionsAfter}`);
    logger.info(`Old rollup: ${rollup.address}. New Rollup: ${newRollup.address}`);

    const attestersAfterOld = await rollup.getAttesters();
    const attestersAfterNew = await newRollup.getAttesters();
    logger.info(`Attesters old before: ${attestersBeforeOld.length}. Attesters old after: ${attestersAfterOld.length}`);
    logger.info(`Attesters new before: ${attestersBeforeNew.length}. Attesters new after: ${attestersAfterNew.length}`);

    // Stop the prover aztec node (which stops the prover subsystem).
    await proverAztecNode.stop();

    // stop all nodes
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      const node = nodes[i];
      await node.stop();
      logger.info(`Node ${i} stopped`);
    }

    await sleep(2500);

    // On the mock-gossip bus there is no bootstrap node or peer discovery to flush — the new nodes simply
    // re-attach to the same in-memory `MockGossipSubNetwork` once spawned.

    // With all down, we make a time jump such that we ensure that we will be at a point where epochs are
    // non-empty. This is to avoid conflicts when the checkpoints are looking further back.
    const futureEpoch = EpochNumber.fromBigInt(500n + BigInt(await newRollup.getCurrentEpochNumber()));
    const futureSlot = SlotNumber.fromBigInt(BigInt(futureEpoch) * BigInt(context.aztecNodeConfig.aztecEpochDuration));
    const time = await newRollup.getTimestampForSlot(futureSlot);
    if (time > BigInt(await context.cheatCodes.eth.lastBlockTimestamp())) {
      await context.cheatCodes.eth.warp(Number(time));
      await waitL1Block();
    }

    const newVersion = await newRollup.getVersion();
    // The new rollup's L1 contract addresses (Inbox/Outbox/FeeJuicePortal) for the L1-side bridging txs.
    // Nodes derive these themselves from `registryAddress` + `rollupVersion` (see the aztec-node factory),
    // so the node/prover configs only need `rollupVersion` to repoint at the new rollup.
    const newRollupAddresses: L1ContractAddresses = {
      ...context.deployL1ContractsValues.l1ContractAddresses,
      ...(await RegistryContract.collectAddresses(
        context.deployL1ContractsValues.l1Client,
        context.deployL1ContractsValues.l1ContractAddresses.registryAddress,
        newVersion,
      )),
    };

    // Config for the new rollup: pointed at the new rollup version.
    const newConfig = {
      rollupVersion: Number(newVersion),
      governanceProposerPayload: EthAddress.ZERO,
    };

    // Repoint the context at the new rollup's genesis before spawning the migrated nodes. Both
    // `createValidatorNodeAt` and `createProverNode` read `context.genesis` at call time, so the migrated
    // validator and fake-prover nodes initialize their world state from `newGenesis` (whose archive root
    // matches the new rollup) and can sync and prove the new rollup's checkpoints. The original nodes were
    // already torn down above, so this does not affect them.
    test.context.genesis = newGenesis;

    await sleep(4000);

    nodes = await Promise.all(
      Array.from({ length: NUM_VALIDATORS }, (_, i) => test.createValidatorNodeAt(i, newConfig)),
    );

    logger.warn(`Creating new prover node`);
    proverAztecNode = await test.createProverNode({ rollupVersion: Number(newVersion) });

    // wait a bit for nodes to attach to the bus and sync
    await sleep(4000);

    // The new rollup should have no checkpoints
    expect(await newRollup.getCheckpointNumber()).toBe(CheckpointNumber(0));

    // Wait for the new rollup to publish its first checkpoint AND for `nodes[0]` to have synced
    // it locally, before the second bridging step. The bridge wallet uses
    // `syncChainTip: 'checkpointed'`, which falls back to the genesis block when no checkpoint
    // exists. After warping ~500 epochs forward, txs anchored at genesis would expire before
    // being included. We poll the node's local view (not just the L1 rollup contract) so the PXE
    // and the assertion observe the same chain state.
    logger.info(`Waiting for new rollup to publish its first checkpoint`);
    await retryUntil(
      async () => Number(await nodes[0].getCheckpointNumber('checkpointed')) > 0,
      'newRollup first checkpoint synced by node',
      300,
      2,
    );
    logger.info(`New rollup published its first checkpoint`);

    // Bridge into and out of the new rollup to ensure that it works.
    await bridging(
      nodes[0],
      fundedAccounts[1],
      context.deployL1ContractsValues.l1Client,
      newRollupAddresses,
      BigInt(newConfig.rollupVersion),
      context.aztecNodeConfig.l1RpcUrls,
    );

    // Both rollups should have a checkpoint number greater than 0
    expect(await rollup.getCheckpointNumber()).toBeGreaterThan(CheckpointNumber(0));
    expect(await newRollup.getCheckpointNumber()).toBeGreaterThan(CheckpointNumber(0));
  }, 10_000_000);
});
