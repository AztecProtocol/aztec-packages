import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { addL1Validator } from '@aztec/cli/l1/validators';
import { RollupContract } from '@aztec/ethereum/contracts';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { MockZKPassportVerifierAbi } from '@aztec/l1-artifacts/MockZKPassportVerifierAbi';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { TopicType } from '@aztec/stdlib/p2p';
import { ZkPassportProofParams } from '@aztec/stdlib/zkpassport';

import { jest } from '@jest/globals';
import { getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import {
  ATTESTER_PRIVATE_KEYS_START_INDEX,
  createNonValidatorNode,
  createProverNode,
} from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES } from './p2p_network.js';
import { maybeCheckQosAlerts, runGossipScenario, waitForNodesToSync } from './shared.js';

// Don't set NUM_VALIDATORS higher than 9 because each node uses a different L1 publisher account and anvil seeds.
const NUM_VALIDATORS = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = process.env.BOOT_NODE_UDP_PORT ? parseInt(process.env.BOOT_NODE_UDP_PORT) : 4500;
const AZTEC_SLOT_DURATION = 24;
const AZTEC_EPOCH_DURATION = 4;
const BLOCK_DURATION_MS = 10_000;

jest.setTimeout(1000 * 60 * 10);

// End-to-end gossip propagation over real libp2p with 4 validators, using the shared
// bootstrap->createNodes->mesh->account->submit->verify skeleton (runGossipScenario). Both describes use
// P2PNetworkTest with SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES (ethSlot=4s, proofSubEpochs=640), aztecSlot=24s,
// blockDurationMs=10000, inboxLag=2, and differ only in how the validator set is registered.
describe('e2e_p2p_network', () => {
  // Registers validators via applyBaseSetup()'s MultiAdder cheat shortcut, then stands up 4 validators +
  // a fake prover node (p2p-only tx collection) + a non-validator monitoring node
  // (alwaysReexecuteBlockProposals:true). Asserts txs mine from every node, attestation signers match the
  // validator set, and the prover eventually produces a proven block by collecting txs from p2p.
  describe('cheat-registered validators', () => {
    let t: P2PNetworkTest;
    let nodes: AztecNodeService[];
    let proverAztecNode: AztecNodeService;
    let monitoringNode: AztecNodeService;

    beforeEach(async () => {
      t = await P2PNetworkTest.create({
        testName: 'e2e_p2p_network',
        numberOfNodes: 0,
        numberOfValidators: NUM_VALIDATORS,
        basePort: BOOT_NODE_UDP_PORT,
        metricsPort: shouldCollectMetrics(),
        startProverNode: false, // we'll start our own using p2p
        initialConfig: {
          ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
          aztecSlotDuration: AZTEC_SLOT_DURATION,
          aztecEpochDuration: AZTEC_EPOCH_DURATION,
          blockDurationMs: BLOCK_DURATION_MS,
          slashingRoundSizeInEpochs: 2,
          slashingQuorum: 5,
          listenAddress: '127.0.0.1',
        },
      });

      await t.setup();
      await t.applyBaseSetup();
    });

    afterEach(async () => {
      await tryStop(proverAztecNode);
      await tryStop(monitoringNode);
      await t.stopNodes(nodes);
      await t.teardown();
    });

    afterAll(async () => {
      await maybeCheckQosAlerts(t.logger);
    });

    it('should rollup txs from all peers', async () => {
      nodes = await runGossipScenario({
        t,
        numValidators: NUM_VALIDATORS,
        bootNodePort: BOOT_NODE_UDP_PORT,
        txsPerNode: NUM_TXS_PER_NODE,
        createExtraNodes: async () => {
          // A prover node that uses p2p only (not rpc) to gather txs, to test prover tx collection.
          t.logger.warn(`Creating prover node`);
          ({ proverNode: proverAztecNode } = await createProverNode(
            t.ctx.aztecNodeConfig,
            BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
            t.bootstrapNodeEnr,
            ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
            { dateProvider: t.ctx.dateProvider },
            t.genesis,
            t.dataDirFor('prover'),
            shouldCollectMetrics(),
          ));

          t.logger.warn(`Creating non validator node`);
          const monitoringNodeConfig: AztecNodeConfig = {
            ...t.ctx.aztecNodeConfig,
            alwaysReexecuteBlockProposals: true,
          };
          monitoringNode = await createNonValidatorNode(
            monitoringNodeConfig,
            t.ctx.dateProvider,
            BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 2,
            t.bootstrapNodeEnr,
            t.genesis,
            t.dataDirFor('monitor'),
            shouldCollectMetrics(),
          );
        },
        beforeSubmit: nodes => waitForNodesToSync(t, nodes),
        afterVerify: async nodes => {
          // Ensure prover node did its job and collected txs from p2p
          await retryUntil(
            async () => {
              const provenBlock = await nodes[0].getBlockNumber('proven');
              return provenBlock > 0;
            },
            'proven block',
            SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES.aztecProofSubmissionEpochs *
              AZTEC_EPOCH_DURATION *
              AZTEC_SLOT_DURATION,
          );
        },
      });
    });
  });

  // Registers validators via the real addL1Validator CLI path (with a ZkPassport mock proof) instead of
  // the MultiAdder cheat shortcut, then submits txs to each node. Asserts the registration took effect
  // on-chain, all txs mine, and attestation signers match the registered validator set.
  describe('on-chain-registered validators (no cheats)', () => {
    let t: P2PNetworkTest;
    let nodes: AztecNodeService[];

    beforeEach(async () => {
      t = await P2PNetworkTest.create({
        testName: 'e2e_p2p_network',
        numberOfNodes: 0,
        numberOfValidators: NUM_VALIDATORS,
        basePort: BOOT_NODE_UDP_PORT,
        metricsPort: shouldCollectMetrics(),
        initialConfig: {
          ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
          aztecSlotDuration: AZTEC_SLOT_DURATION,
          blockDurationMs: BLOCK_DURATION_MS,
          listenAddress: '127.0.0.1',
          // Allow empty blocks so the first checkpoint can be published before any txs are submitted.
          // Without this, no blocks are built until txs arrive, and a failed checkpoint during tx
          // submission causes block pruning that invalidates tx references.
          minTxsPerBlock: 0,
        },
      });

      await t.setup();
      await t.addBootstrapNode();
    });

    afterEach(async () => {
      await t.stopNodes(nodes);
      await t.teardown();
    });

    afterAll(async () => {
      await maybeCheckQosAlerts(t.logger);
    });

    it('should rollup txs from all peers (and add the validators without cheating)', async () => {
      nodes = await runGossipScenario({
        t,
        numValidators: NUM_VALIDATORS,
        bootNodePort: BOOT_NODE_UDP_PORT,
        txsPerNode: NUM_TXS_PER_NODE,
        submitSequentially: true,
        // A full mesh (N-1 peers per node) on the proposal/checkpoint topics is required: with
        // skipInitialSequencer the first blocks are built by this committee, and the first checkpoint must
        // reach quorum (all 4 validators) to land on L1. If those meshes are only partly formed, some
        // committee members miss the first proposal, the checkpoint stalls at 2/3, and every later slot
        // rebuilds a competing un-checkpointed block 1 that peers reject as `block_number_already_exists`
        // — a permanent 2/3 deadlock.
        mesh: {
          expectedNodeCount: NUM_VALIDATORS,
          timeoutSeconds: 60,
          checkIntervalSeconds: 0.5,
          topics: [TopicType.block_proposal, TopicType.checkpoint_proposal, TopicType.checkpoint_attestation],
          minMeshPeerCount: NUM_VALIDATORS - 1,
        },
        beforeCreateNodes: async () => {
          expect(t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetHandlerAddress).toBeDefined();

          const { validators } = t.getValidators();

          const rollupWrapper = RollupContract.getFromL1ContractsValues(t.ctx.deployL1ContractsValues);

          const rollup = getContract({
            address: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
            abi: RollupAbi,
            client: t.ctx.deployL1ContractsValues.l1Client,
          });

          const zkPassportVerifier = getContract({
            address: t.ctx.deployL1ContractsValues.l1ContractAddresses.zkPassportVerifierAddress!.toString(),
            abi: MockZKPassportVerifierAbi,
            client: t.ctx.deployL1ContractsValues.l1Client,
          });

          expect((await rollupWrapper.getAttesters()).length).toBe(0);

          // Use the base account as the withdrawer for all validators in this test
          const withdrawerAddress = EthAddress.fromString(t.baseAccount.address);

          // Add the validators to the rollup using the same function as the CLI
          for (let i = 0; i < validators.length; i++) {
            const validator = validators[i];
            const mockPassportProof = ZkPassportProofParams.random().toBuffer();
            await addL1Validator({
              rpcUrls: t.ctx.aztecNodeConfig.l1RpcUrls,
              chainId: t.ctx.aztecNodeConfig.l1ChainId,
              privateKey: t.baseAccountPrivateKey,
              mnemonic: undefined,
              attesterAddress: EthAddress.fromString(validator.attester.toString()),
              withdrawerAddress,
              stakingAssetHandlerAddress: t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetHandlerAddress!,
              proofParams: mockPassportProof,
              blsSecretKey: Fr.random().toBigInt(),
              log: t.logger.info,
              debugLogger: t.logger,
            });

            // mock nullifiers - increment the id in the mock zk passport verifier
            t.logger.info('Incrementing unique identifier in mock zk passport verifier');
            await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
              hash: await zkPassportVerifier.write.incrementUniqueIdentifier(),
            });
          }

          await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
            hash: await rollup.write.flushEntryQueue(),
          });

          const attestersImmedatelyAfterAdding = await rollupWrapper.getAttesters();
          expect(attestersImmedatelyAfterAdding.length).toBe(validators.length);

          // Check that the validators are added correctly
          for (const validator of validators) {
            const info = await rollupWrapper.getAttesterView(validator.attester.toString());
            expect(info.config.withdrawer.toChecksumString()).toBe(withdrawerAddress.toChecksumString());
          }

          // Wait for the validators to be added to the rollup
          const timestamp = await t.ctx.cheatCodes.rollup.advanceToEpoch(
            EpochNumber(t.ctx.aztecNodeConfig.lagInEpochsForValidatorSet + 1),
          );

          // Changes have now taken effect
          const attesters = await rollupWrapper.getAttesters();
          expect(attesters.length).toBe(validators.length);
          expect(attesters.length).toBe(NUM_VALIDATORS);

          // Send and await a tx to make sure we mine a block for the warp to correctly progress.
          await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
            hash: await t.ctx.deployL1ContractsValues.l1Client.sendTransaction({
              to: t.baseAccount.address,
              value: 1n,
              account: t.baseAccount,
            }),
          });

          // Set the system time in the node, only after we have warped the time and waited for a block
          // Time is only set in the NEXT block
          t.ctx.dateProvider.setTime(Number(timestamp) * 1000);
        },
        beforeSubmit: async nodes => {
          // Wait for the first checkpoint to be published to L1 before submitting transactions.
          // With skipInitialSequencer, no blocks exist from setup, so the first blocks are built by the
          // validator committee. If we submit txs before a checkpoint lands on L1, a failed checkpoint
          // publish can prune locally-proposed blocks, causing txs to reference pruned block headers.
          t.logger.info('Waiting for first checkpoint to be published');
          await retryUntil(
            async () => (await nodes[0].getBlockNumber('checkpointed')) > 0,
            'first checkpoint published',
            120,
          );
          t.logger.info('First checkpoint published');

          // Wait for the next L1 block so that all nodes' getCurrentMinFees() caches are
          // refreshed after the first L2 checkpoint is published. Without this, some wallets
          // may estimate fees based on pre-checkpoint values (very low due to fee decay),
          // while receiving nodes already see the post-checkpoint fees (much higher).
          const ethereumSlotDuration = t.ctx.aztecNodeConfig.ethereumSlotDuration ?? 4;
          await sleep((ethereumSlotDuration + 1) * 1000);
        },
      });
    });
  });
});
