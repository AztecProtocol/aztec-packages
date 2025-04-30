import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, Fr, sleep } from '@aztec/aztec.js';
import { addL1Validator } from '@aztec/cli/l1';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { StakingAssetHandlerAbi } from '@aztec/l1-artifacts/StakingAssetHandlerAbi';
import type { SequencerClient } from '@aztec/sequencer-client';
import { BlockAttestation, ConsensusPayload } from '@aztec/stdlib/p2p';

import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getContract } from 'viem';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { type NodeContext, createNodes } from '../fixtures/setup_p2p_test.js';
import { AlertChecker, type AlertConfig } from '../quality_of_service/alert_checker.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { createPXEServiceAndSubmitTransactions } from './shared.js';

const CHECK_ALERTS = process.env.CHECK_ALERTS === 'true';

// Don't set this to a higher value than 9 because each node will use a different L1 publisher account and anvil seeds
const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 2;
const BOOT_NODE_UDP_PORT = 4500;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gossip-'));

jest.setTimeout(1000 * 60 * 10);

const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'aztec_sequencer_time_to_collect_attestations > 3500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

describe('e2e_p2p_network', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_network',
      numberOfNodes: NUM_NODES,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG,
        listenAddress: '127.0.0.1',
      },
    });

    await t.setupAccount();
    await t.addBootstrapNode();
    await t.setup();
    await t.removeInitialNode();
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  afterAll(async () => {
    if (CHECK_ALERTS) {
      const checker = new AlertChecker(t.logger);
      await checker.runAlertCheck(qosAlerts);
    }
  });

  it('should rollup txs from all peers (and add the validators without cheating)', async () => {
    // create the bootstrap node for the network
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.ctx.aztecNodeConfig.validatorReexecute = true;

    expect(t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetHandlerAddress).toBeDefined();

    const { validators, proposerEOAs } = t.getValidators();

    const rollup = getContract({
      address: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    const stakingAssetHandler = getContract({
      address: t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetHandlerAddress!.toString(),
      abi: StakingAssetHandlerAbi,
      client: t.ctx.deployL1ContractsValues.l1Client,
    });

    expect((await rollup.read.getAttesters()).length).toBe(0);

    // Add the validators to the rollup using the same function as the CLI
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      const proposerEOA = proposerEOAs[i];
      await addL1Validator({
        rpcUrls: t.ctx.aztecNodeConfig.l1RpcUrls,
        chainId: t.ctx.aztecNodeConfig.l1ChainId,
        privateKey: t.baseAccountPrivateKey,
        mnemonic: undefined,
        attesterAddress: EthAddress.fromString(validator.attester),
        proposerEOAAddress: EthAddress.fromString(proposerEOA),
        stakingAssetHandlerAddress: t.ctx.deployL1ContractsValues.l1ContractAddresses.stakingAssetHandlerAddress!,
        log: t.logger.info,
        debugLogger: t.logger,
      });
    }

    // Changes do not take effect until the next epoch
    const attestersImmedatelyAfterAdding = await rollup.read.getAttesters();
    expect(attestersImmedatelyAfterAdding.length).toBe(0);

    // Check that the validators are added correctly
    const withdrawer = await stakingAssetHandler.read.withdrawer();
    for (const validator of validators) {
      const info = await rollup.read.getInfo([validator.attester]);
      expect(info.proposer).toBe(validator.proposer);
      expect(info.withdrawer).toBe(withdrawer);
    }

    const slotsInEpoch = await rollup.read.getEpochDuration();
    const timestamp = await rollup.read.getTimestampForSlot([slotsInEpoch]);
    const cheatCodes = new EthCheatCodesWithState(t.ctx.aztecNodeConfig.l1RpcUrls);
    try {
      await cheatCodes.warp(Number(timestamp));
    } catch (err) {
      t.logger.debug('Warp failed, time already satisfied');
    }

    // Changes have now taken effect
    const attesters = await rollup.read.getAttesters();
    expect(attesters.length).toBe(validators.length);
    expect(attesters.length).toBe(NUM_NODES);

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

    // create our network of nodes and submit txs into each of them
    // the number of txs per node and the number of txs per rollup
    // should be set so that the only way for rollups to be built
    // is if the txs are successfully gossiped around the nodes.
    const contexts: NodeContext[] = [];
    t.logger.info('Creating nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // wait a bit for peers to discover each other
    await sleep(4000);

    t.logger.info('Submitting transactions');
    for (const node of nodes) {
      const context = await createPXEServiceAndSubmitTransactions(t.logger, node, NUM_TXS_PER_NODE, t.fundedAccount);
      contexts.push(context);
    }

    t.logger.info('Waiting for transactions to be mined');
    // now ensure that all txs were successfully mined
    await Promise.all(
      contexts.flatMap((context, i) =>
        context.txs.map(async (tx, j) => {
          t.logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait({ timeout: WAIT_FOR_TX_TIMEOUT });
        }),
      ),
    );
    t.logger.info('All transactions mined');

    // Gather signers from attestations downloaded from L1
    const blockNumber = await contexts[0].txs[0].getReceipt().then(r => r.blockNumber!);
    const dataStore = ((nodes[0] as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getBlocks(blockNumber, blockNumber);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.signatures
      .filter(s => !s.isEmpty)
      .map(sig => new BlockAttestation(new Fr(block.block.number), payload, sig));
    const signers = attestations.map(att => att.getSender().toString());
    t.logger.info(`Attestation signers`, { signers });

    // Check that the signers found are part of the proposer nodes to ensure the archiver fetched them right
    const validatorAddresses = nodes.map(node =>
      ((node as AztecNodeService).getSequencer() as SequencerClient).validatorAddress?.toString(),
    );
    t.logger.info(`Validator addresses`, { addresses: validatorAddresses });
    for (const signer of signers) {
      expect(validatorAddresses).toContain(signer);
    }
  });
});
