import type { InitialAccountData } from '@aztec/accounts/testing';
import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxHash } from '@aztec/aztec.js/tx';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Signature } from '@aztec/foundation/eth-signature';
import { retryUntil } from '@aztec/foundation/retry';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { getPXEConfig, getPXEConfig as getRpcConfig } from '@aztec/pxe/server';
import type { SequencerClient } from '@aztec/sequencer-client';
import { CheckpointAttestation, ConsensusPayload, type TopicType } from '@aztec/stdlib/p2p';

import { expect } from '@jest/globals';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { SchnorrHardcodedKeyAccountContract } from '../fixtures/schnorr_hardcoded_account_contract.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { waitForTxs } from '../fixtures/wait_helpers.js';
import { type AlertConfig, GrafanaClient } from '../quality_of_service/grafana_client.js';
import { submitTxsTo } from '../shared/submit-transactions.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { type ProvenTx, proveInteraction } from '../test-wallet/utils.js';
import { type P2PNetworkTest, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';

/** One published checkpoint as returned by the archiver, including its attestations. */
type PublishedCheckpoint = Awaited<ReturnType<Archiver['getCheckpoints']>>[number];

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (
  logger: Logger,
  from: AztecAddress,
  spamContract: SpamContract,
  numTxs: number,
  opts: { callPublic?: boolean } = {},
) => {
  const txs: TxHash[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    const method = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic);
    const { txHash } = await method.send({ from, wait: NO_WAIT });
    logger.info(`Tx sent with hash ${txHash.toString()}`);
    txs.push(txHash);
  }
  return txs;
};

// creates a wallet and submit a given number of transactions through it.
export const submitTransactions = async (
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<TxHash[]> => {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const wallet = await TestWallet.create(
    node,
    // Use checkpointed chain tip to avoid anchoring on provisional blocks that the archiver can prune
    // when their slot ends without a checkpoint landing on L1.
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const contract = new SchnorrHardcodedKeyAccountContract();
  const fundedAccountManager = await wallet.createAccount({
    secret: fundedAccount.secret,
    salt: fundedAccount.salt,
    contract,
  });
  return submitTxsTo(wallet, fundedAccountManager.address, numTxs, logger);
};

export async function prepareTransactions(
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<ProvenTx[]> {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;

  const wallet = await TestWallet.create(
    node,
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const accountContract = new SchnorrHardcodedKeyAccountContract();
  const fundedAccountManager = await wallet.createAccount({
    secret: fundedAccount.secret,
    salt: fundedAccount.salt,
    contract: accountContract,
  });

  const testContractInstance = await getContractInstanceFromInstantiationParams(TestContractArtifact, {
    salt: Fr.random(),
  });
  await wallet.registerContract(testContractInstance, TestContractArtifact);
  const contract = TestContract.at(testContractInstance.address, wallet);

  return timesAsync(numTxs, async () => {
    const tx = await proveInteraction(wallet, contract.methods.emit_nullifier(Fr.random()), {
      from: fundedAccountManager.address,
    });
    logger.info(`Tx prepared with hash ${tx.getTxHash()}`);
    return tx;
  });
}

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'aztec_sequencer_time_to_collect_attestations > 3500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

/** Runs the shared p2p QoS Grafana alert check when CHECK_ALERTS=true; a no-op otherwise. */
export async function maybeCheckQosAlerts(logger: Logger): Promise<void> {
  if (CHECK_ALERTS) {
    const checker = new GrafanaClient(logger);
    await checker.runAlertCheck(qosAlerts);
  }
}

/** Waits until every node's synced block number reaches the initial node's current tip. */
export async function waitForNodesToSync(t: P2PNetworkTest, nodes: AztecNodeService[]): Promise<void> {
  const targetBlock = await t.ctx.aztecNode.getBlockNumber();
  t.logger.warn(`Waiting for all nodes to sync to block number ${targetBlock}`);
  await retryUntil(
    async () => {
      const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
      const checkpointNumber = (await t.monitor.run()).checkpointNumber;
      t.logger.info(`Current block numbers ${blockNumbers} (checkpoint number on L1 is ${checkpointNumber})`);
      return blockNumbers.every(bn => bn >= targetBlock);
    },
    `nodes to sync to block number ${targetBlock}`,
    30,
    0.5,
  );
}

/** Reads the published checkpoint containing the block that mined the given tx. */
export async function getPublishedCheckpointForTx(
  node: AztecNodeService,
  txHash: TxHash,
): Promise<PublishedCheckpoint> {
  const receipt = await node.getTxReceipt(txHash);
  const blockNumber = receipt.blockNumber!;
  const dataStore = node.getBlockSource() as Archiver;
  const blockData = await dataStore.getBlockData({ number: BlockNumber(blockNumber) });
  const [publishedCheckpoint] = await dataStore.getCheckpoints({ from: blockData!.checkpointNumber, limit: 1 });
  return publishedCheckpoint;
}

/** Polls until the archiver has indexed the first published checkpoint, then returns it. */
export async function waitForFirstPublishedCheckpoint(
  t: P2PNetworkTest,
  nodes: AztecNodeService[],
  timeoutSeconds = 120,
): Promise<PublishedCheckpoint> {
  const dataStore = nodes[0].getBlockSource() as Archiver;
  t.logger.warn('Waiting for first checkpoint to be published and indexed by the archiver');
  return await retryUntil(
    async () => {
      const blockNumbers = await Promise.all(nodes.map(node => node.getBlockNumber()));
      const checkpointNumber = (await t.monitor.run()).checkpointNumber;
      t.logger.info(`Current block numbers ${blockNumbers} (checkpoint number on L1 is ${checkpointNumber})`);
      const [checkpoint] = await dataStore.getCheckpoints({ from: CheckpointNumber(1), limit: 1 });
      return checkpoint;
    },
    'published checkpoint to be indexed',
    timeoutSeconds,
    1,
  );
}

/**
 * Recovers the attestation signers from a published checkpoint and asserts each one belongs to the
 * validator set formed by the given nodes. Returns the recovered signer addresses so callers can add
 * scenario-specific assertions (e.g. an exact signer count).
 */
export async function verifyAttestationSigners(
  t: P2PNetworkTest,
  nodes: AztecNodeService[],
  publishedCheckpoint: PublishedCheckpoint,
): Promise<string[]> {
  const signatureContext = {
    chainId: t.ctx.aztecNodeConfig.l1ChainId,
    rollupAddress: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
  };
  const payload = ConsensusPayload.fromCheckpoint(publishedCheckpoint.checkpoint, signatureContext);
  const attestations = publishedCheckpoint.attestations
    .filter(a => !a.signature.isEmpty())
    .map(a => new CheckpointAttestation(payload, a.signature, Signature.empty()));
  const signers = await Promise.all(attestations.map(att => att.getSender()!.toString()));
  t.logger.info(`Attestation signers`, { signers });

  // Check that the signers found are part of the proposer nodes to ensure the archiver fetched them right
  const validatorAddresses = nodes.flatMap(node =>
    (node.getSequencer() as SequencerClient).validatorAddresses?.map(a => a.toString()),
  );
  t.logger.info(`Validator addresses`, { addresses: validatorAddresses });
  for (const signer of signers) {
    expect(validatorAddresses).toContain(signer);
  }
  return signers;
}

/** Options that parameterize {@link runGossipScenario}. */
export interface GossipScenarioOptions {
  /** The initialized P2P network test (setup() + validator registration already done). */
  t: P2PNetworkTest;
  /** Number of validator nodes forming the committee. */
  numValidators: number;
  /** Base UDP port for the validator nodes. */
  bootNodePort: number;
  /** Transactions submitted per validator node; 0 skips tx submission entirely (e.g. the oracle test). */
  txsPerNode: number;
  /** Submit tx batches sequentially instead of concurrently. */
  submitSequentially?: boolean;
  /** Overrides for the P2P mesh-connectivity wait; unset fields fall back to waitForP2PMeshConnectivity defaults. */
  mesh?: {
    expectedNodeCount?: number;
    timeoutSeconds?: number;
    checkIntervalSeconds?: number;
    topics?: TopicType[];
    minMeshPeerCount?: number;
  };
  /** Which published checkpoint the attestation signers are read from (defaults to the first tx's block). */
  checkpointSource?: 'first-tx' | 'first-published';
  /** Runs after validator registration but before the validator nodes are created. */
  beforeCreateNodes?: () => Promise<void>;
  /** Creates extra non-validator nodes (prover/monitor) once the validator nodes exist. */
  createExtraNodes?: (nodes: AztecNodeService[]) => Promise<void>;
  /** Runs after the account is registered but before txs are submitted (sync waits, checkpoint waits, sleeps). */
  beforeSubmit?: (nodes: AztecNodeService[]) => Promise<void>;
  /** Scenario-specific verification run after attestation-signer verification (proven block, price convergence). */
  afterVerify?: (nodes: AztecNodeService[]) => Promise<void>;
}

/**
 * Shared skeleton for the p2p gossip tests: create the validator nodes and any extra nodes, wait for
 * the mesh to form, register the account, optionally submit and mine txs, then verify the attestation
 * signers of a published checkpoint. Each varying part (validator registration, extra nodes, pre-submit
 * waits, scenario-specific verification) is supplied via the callbacks in {@link GossipScenarioOptions}.
 * Returns the validator nodes so the caller can track them for teardown.
 */
export async function runGossipScenario(opts: GossipScenarioOptions): Promise<AztecNodeService[]> {
  const { t, numValidators, bootNodePort, txsPerNode } = opts;

  if (!t.bootstrapNodeEnr) {
    throw new Error('Bootstrap node ENR is not available');
  }

  await opts.beforeCreateNodes?.();

  t.logger.info('Creating validator nodes');
  const nodes = await createNodes(
    t.ctx.aztecNodeConfig,
    t.ctx.dateProvider,
    t.bootstrapNodeEnr,
    numValidators,
    bootNodePort,
    t.genesis,
    t.dataDirFor('validator'),
    shouldCollectMetrics(),
  );

  await opts.createExtraNodes?.(nodes);

  t.logger.info('Waiting for nodes to connect');
  await t.waitForP2PMeshConnectivity(
    nodes,
    opts.mesh?.expectedNodeCount ?? numValidators,
    opts.mesh?.timeoutSeconds,
    opts.mesh?.checkIntervalSeconds,
    opts.mesh?.topics,
    opts.mesh?.minMeshPeerCount,
  );

  // We need to create the nodes before we setup the account, because those nodes form the committee
  // and blocks cannot be built without them (targetCommitteeSize is set to the number of nodes).
  await t.setupAccount();

  await opts.beforeSubmit?.(nodes);

  let firstTxHash: TxHash | undefined;
  if (txsPerNode > 0) {
    t.logger.info('Submitting transactions');
    const submitOne = (node: AztecNodeService) => submitTransactions(t.logger, node, txsPerNode, t.fundedAccount);
    // Each submitTransactions call builds its own wallet/PXE, so submissions are independent. When run
    // concurrently, Promise.all preserves node order so submitted[i] stays aligned with nodes[i].
    const submitted: TxHash[][] = [];
    if (opts.submitSequentially) {
      for (const node of nodes) {
        submitted.push(await submitOne(node));
      }
    } else {
      submitted.push(...(await Promise.all(nodes.map(submitOne))));
    }
    firstTxHash = submitted[0][0];

    t.logger.info('Waiting for transactions to be mined');
    await waitForTxs(nodes[0], submitted.flat(), { timeout: WAIT_FOR_TX_TIMEOUT });
    t.logger.info('All transactions mined');
  }

  const publishedCheckpoint =
    opts.checkpointSource === 'first-published'
      ? await waitForFirstPublishedCheckpoint(t, nodes)
      : await getPublishedCheckpointForTx(nodes[0], firstTxHash!);

  await verifyAttestationSigners(t, nodes, publishedCheckpoint);

  await opts.afterVerify?.(nodes);

  return nodes;
}
