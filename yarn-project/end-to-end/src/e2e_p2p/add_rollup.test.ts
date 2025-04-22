import { getSchnorrWalletWithSecretKey } from '@aztec/accounts/schnorr';
import { type InitialAccountData, deployFundedSchnorrAccount, getInitialTestAccounts } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, Fr, generateClaimSecret, retryUntil, sleep } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec.js/testing';
import { createBlobSinkServer } from '@aztec/blob-sink/server';
import {
  type ExtendedViemWalletClient,
  type L1ContractAddresses,
  L1TxUtils,
  RegistryContract,
  RollupContract,
  type ViemPublicClient,
  type ViemWalletClient,
  defaultL1TxUtilsConfig,
  deployL1Contract,
  deployRollupForUpgrade,
} from '@aztec/ethereum';
import { sha256ToField } from '@aztec/foundation/crypto';
import {
  GovernanceAbi,
  GovernanceProposerAbi,
  OutboxAbi,
  RegisterNewRollupVersionPayloadAbi,
  RegisterNewRollupVersionPayloadBytecode,
  RegistryAbi,
  RollupAbi,
  TestERC20Abi as StakingAssetAbi,
  TestERC20Abi,
} from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-contracts.js/Test';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { getGenesisValues } from '@aztec/world-state/testing';

import { jest } from '@jest/globals';
import fs from 'fs';
import getPort from 'get-port';
import os from 'os';
import path from 'path';
import { type Hex, decodeEventLog, encodeFunctionData, getAddress, getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG } from './p2p_network.js';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
// Note: these ports must be distinct from the other e2e tests, else the tests will
// interfere with each other.
const BOOT_NODE_UDP_PORT = 45000;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'add-rollup-old-'));
const DATA_DIR_NEW = fs.mkdtempSync(path.join(os.tmpdir(), 'add-rollup-new-'));

jest.setTimeout(1000 * 60 * 10);

/**
 * This test emulates the addition of a new rollup to the registry and tests that cross-chain messages work.
 * Transactions are sent to the current rollup to check crosschain messages in both directions.
 * The sequencers proposer a proposal, the proposal is executed and the new rollup is added to the registry
 * The nodes are then updated to use the new rollup and we send transactions to try cross-chain in both directions
 * ensuring that it also works on the new rollup.
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
    await l1TxUtils.sendAndMonitorTransaction({
      to: registry.address,
      data: encodeFunctionData({
        abi: RegistryAbi,
        functionName: 'transferOwnership',
        args: [governance.address],
      }),
    });

    // Now that we have passed on the registry, we can deploy the new rollup.
    const initialTestAccounts = await getInitialTestAccounts();
    const { genesisArchiveRoot, fundingNeeded, prefilledPublicData } = await getGenesisValues(
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
        ethereumSlotDuration: t.ctx.aztecNodeConfig.ethereumSlotDuration,
        aztecSlotDuration: t.ctx.aztecNodeConfig.aztecSlotDuration,
        aztecEpochDuration: t.ctx.aztecNodeConfig.aztecEpochDuration,
        aztecTargetCommitteeSize: t.ctx.aztecNodeConfig.aztecTargetCommitteeSize,
        aztecProofSubmissionWindow: t.ctx.aztecNodeConfig.aztecProofSubmissionWindow,
        minimumStake: t.ctx.aztecNodeConfig.minimumStake,
        slashingQuorum: t.ctx.aztecNodeConfig.slashingQuorum,
        slashingRoundSize: t.ctx.aztecNodeConfig.slashingRoundSize,
        manaTarget: t.ctx.aztecNodeConfig.manaTarget,
        provingCostPerMana: t.ctx.aztecNodeConfig.provingCostPerMana,
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

      // I **LOVE** wrapping things like this to avoid underpaying.
      await Promise.all([
        await l1TxUtils.sendAndMonitorTransaction({
          to: stakingAsset.address,
          data: encodeFunctionData({
            abi: TestERC20Abi,
            functionName: 'mint',
            args: [emperor.address, stakeNeeded],
          }),
        }),
        await l1TxUtils.sendAndMonitorTransaction({
          to: stakingAsset.address,
          data: encodeFunctionData({
            abi: TestERC20Abi,
            functionName: 'approve',
            args: [newRollup.address, stakeNeeded],
          }),
        }),
      ]);

      // Works fine because only 4 nodes.
      await l1TxUtils.sendAndMonitorTransaction({
        to: newRollup.address,
        data: encodeFunctionData({
          abi: RollupAbi,
          functionName: 'cheat__InitialiseValidatorSet',
          args: [attesterInfos],
        }),
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

    const bridging = async (
      node: AztecNodeService,
      aliceAccount: InitialAccountData,
      clients: {
        walletClient: ViemWalletClient;
        publicClient: ViemPublicClient;
      },
      l1ContractAddresses: L1ContractAddresses,
      rollupVersion: bigint,
      l1RpcUrls: string[],
    ) => {
      // Bridge assets into the rollup, and consume the message.
      // We are doing some of the things that are in the crosschain harness, but we don't actually want the full thing
      const pxeService = await createPXEService(node, { ...getPXEServiceConfig(), proverEnabled: false }, true);
      await deployFundedSchnorrAccount(pxeService, aliceAccount, undefined, undefined);

      const alice = await getSchnorrWalletWithSecretKey(
        pxeService,
        aliceAccount.secret,
        aliceAccount.signingKey,
        aliceAccount.salt,
      );

      const testContract = await TestContract.deploy(alice).send().deployed();

      const [secret, secretHash] = await generateClaimSecret();

      const contentIntoRollup = Fr.random();
      const contentOutFromRollup = Fr.random();

      const ethRecipient = EthAddress.fromString(clients.walletClient.account.address);

      const message = { recipient: testContract.address, content: contentIntoRollup, secretHash };
      const [message1Hash, actualMessage1Index] = await sendL1ToL2Message(message, {
        walletClient: clients.walletClient,
        publicClient: clients.publicClient,
        l1ContractAddresses: l1ContractAddresses,
      });

      let l2OutgoingReceipt;

      const makeMessageConsumable = async (msgHash: Fr) => {
        // We poll isL1ToL2MessageSynced endpoint until the message is available
        await retryUntil(async () => await node.isL1ToL2MessageSynced(msgHash), 'message sync', 10);

        l2OutgoingReceipt = await testContract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(contentOutFromRollup, ethRecipient)
          .send()
          .wait();

        await testContract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(contentOutFromRollup, ethRecipient)
          .send()
          .wait();
      };

      await makeMessageConsumable(message1Hash);

      // Then we finish up the L1 -> L2 message
      const [message1Index] = (await node.getL1ToL2MessageMembershipWitness('latest', message1Hash))!;
      expect(actualMessage1Index.toBigInt()).toBe(message1Index);

      await testContract.methods
        .consume_message_from_arbitrary_sender_private(message.content, secret, ethRecipient, message1Index)
        .send()
        .wait();

      // Then we consume the L2 -> L1 message
      {
        const l2ToL1Message = {
          sender: {
            actor: testContract.address.toString() as Hex,
            version: BigInt(rollupVersion),
          },
          recipient: {
            actor: ethRecipient.toString() as Hex,
            chainId: BigInt(clients.publicClient.chain.id),
          },
          content: contentOutFromRollup.toString() as Hex,
        };

        const leaf = sha256ToField([
          testContract.address,
          new Fr(rollupVersion), // aztec version
          ethRecipient.toBuffer32(),
          new Fr(clients.publicClient.chain.id), // chain id
          contentOutFromRollup,
        ]);

        const [l2MessageIndex, siblingPath] = await node.getL2ToL1MessageMembershipWitness(
          l2OutgoingReceipt!.blockNumber!,
          leaf,
        );

        // We need to mark things as proven
        const cheatcodes = CheatCodes.createRollup(l1RpcUrls, l1ContractAddresses);
        await cheatcodes.markAsProven();

        // Then we want to go and comsume it!
        const outbox = getContract({
          address: l1ContractAddresses.outboxAddress.toString(),
          abi: OutboxAbi,
          client: clients.walletClient,
        });

        const { receipt: txReceipt } = await l1TxUtils.sendAndMonitorTransaction({
          to: outbox.address,
          data: encodeFunctionData({
            abi: OutboxAbi,
            functionName: 'consume',
            args: [
              l2ToL1Message,
              BigInt(l2OutgoingReceipt!.blockNumber!),
              BigInt(l2MessageIndex),
              siblingPath.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
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
            l2BlockNumber: bigint;
            root: `0x${string}`;
            messageHash: `0x${string}`;
            leafIndex: bigint;
          };
        };

        // We check that MessageConsumed event was emitted with the expected message hash and leaf index
        expect(topics.args.messageHash).toStrictEqual(leaf.toString());
        expect(topics.args.leafIndex).toStrictEqual(BigInt(0));
      }
    };

    await bridging(
      nodes[0],
      t.ctx.initialFundedAccounts[0],
      {
        walletClient: t.ctx.deployL1ContractsValues.walletClient,
        publicClient: t.ctx.deployL1ContractsValues.publicClient,
      },
      t.ctx.deployL1ContractsValues.l1ContractAddresses,
      BigInt(t.ctx.aztecNodeConfig.rollupVersion),
      t.ctx.aztecNodeConfig.l1RpcUrls,
    );

    let govData;
    while (true) {
      govData = await govInfo();
      if (govData.leaderVotes >= quorumSize) {
        break;
      }
      await sleep(t.ctx.aztecNodeConfig.ethereumSlotDuration * t.ctx.aztecNodeConfig.aztecSlotDuration * 1000);
    }

    const nextRoundTimestamp2 = await rollup.getTimestampForSlot(
      ((await rollup.getSlotNumber()) / roundSize) * roundSize + roundSize,
    );
    t.logger.info(`Warpping to ${nextRoundTimestamp2}`);
    await t.ctx.cheatCodes.eth.warp(Number(nextRoundTimestamp2));

    await waitL1Block();

    t.logger.info(`Executing proposal ${govData.round}`);

    await l1TxUtils.sendAndMonitorTransaction({
      to: governanceProposer.address,
      data: encodeFunctionData({
        abi: GovernanceProposerAbi,
        functionName: 'executeProposal',
        args: [govData.round],
      }),
    });
    t.logger.info(`Executed proposal ${govData.round}`);

    const token = getContract({
      address: t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetAddress.toString(),
      abi: StakingAssetAbi,
      client: t.ctx.deployL1ContractsValues.walletClient,
    });

    const stakeNeeded = 10000n * 10n ** 18n;
    t.logger.info(`Minting tokens`);
    await Promise.all([
      await l1TxUtils.sendAndMonitorTransaction({
        to: token.address,
        data: encodeFunctionData({
          abi: TestERC20Abi,
          functionName: 'mint',
          args: [emperor.address, stakeNeeded],
        }),
      }),
      await l1TxUtils.sendAndMonitorTransaction({
        to: token.address,
        data: encodeFunctionData({
          abi: TestERC20Abi,
          functionName: 'approve',
          args: [governance.address, stakeNeeded],
        }),
      }),
    ]);

    await l1TxUtils.sendAndMonitorTransaction({
      to: governance.address,
      data: encodeFunctionData({
        abi: GovernanceAbi,
        functionName: 'deposit',
        args: [emperor.address, stakeNeeded],
      }),
    });

    t.logger.info(`Deposited tokens`);

    const proposal = await governance.read.getProposal([0n]);

    const timeToActive = proposal.creation + proposal.config.votingDelay;
    t.logger.info(`Warping to ${timeToActive + 1n}`);
    await t.ctx.cheatCodes.eth.warp(Number(timeToActive + 1n));
    t.logger.info(`Warped to ${timeToActive + 1n}`);
    await waitL1Block();

    t.logger.info(`Voting`);

    await l1TxUtils.sendAndMonitorTransaction({
      to: governance.address,
      data: encodeFunctionData({
        abi: GovernanceAbi,
        functionName: 'vote',
        args: [0n, stakeNeeded, true],
      }),
    });
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
    const addresses = await RegistryContract.collectAddresses(
      t.ctx.deployL1ContractsValues.publicClient,
      t.ctx.deployL1ContractsValues.l1ContractAddresses.registryAddress,
      newVersion,
    );

    const blobSinkPort = await getPort();
    const newConfig = {
      ...t.ctx.aztecNodeConfig,
      rollupVersion: Number(newVersion),
      governanceProposerPayload: EthAddress.ZERO,
      l1Contracts: { ...t.ctx.deployL1ContractsValues.l1ContractAddresses, ...addresses },
      blobSinkUrl: `http://127.0.0.1:${blobSinkPort}`,
    };

    // Start a new blob sink service
    // @note: The blob sink service uses the ROLLUP_ADDRESS directly, so we need to update as above
    //        since we cannot
    const blobSink = await createBlobSinkServer({
      l1ChainId: newConfig.l1ChainId,
      l1RpcUrls: newConfig.l1RpcUrls,
      l1Contracts: newConfig.l1Contracts,
      port: blobSinkPort,
      dataDirectory: newConfig.dataDirectory,
      dataStoreMapSizeKB: newConfig.dataStoreMapSizeKB,
    });
    await blobSink.start();
    await sleep(4000);

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

    // wait a bit for peers to discover each other
    await sleep(4000);

    // The new rollup should have no blocks
    expect(await newRollup.getBlockNumber()).toBe(0n);

    // Bridge into and out of the new rollup to ensure that it works.
    await bridging(
      nodes[0],
      initialTestAccounts[0],
      {
        walletClient: t.ctx.deployL1ContractsValues.walletClient,
        publicClient: t.ctx.deployL1ContractsValues.publicClient,
      },
      newConfig.l1Contracts,
      BigInt(newConfig.rollupVersion),
      newConfig.l1RpcUrls,
    );

    // Both rollups should have a block number greater than 0
    expect(await rollup.getBlockNumber()).toBeGreaterThan(0n);
    expect(await newRollup.getBlockNumber()).toBeGreaterThan(0n);

    await blobSink.stop();
  }, 10_000_000);
});
