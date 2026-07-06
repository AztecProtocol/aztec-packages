import type { AztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js/log';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { asyncMap } from '@aztec/foundation/async-map';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

const NODE_COUNT = 3;

// A committee member that emits its own attestations in yParity (v ∈ {0, 1}) form models the A-1351
// attester-side DoS. Without normalization the non-canonical recovery byte reaches L1 in the honest
// proposer's bundle and epoch proving reverts (ValidatorSelectionLib.verifyAttestations → ECDSA.recover
// rejects v ∉ {27, 28}), so the on-chain proven tip stalls. With A-1351 applied the honest proposer
// canonicalizes the byte on pool ingress and again in orderAttestations before the L1 bundle, so the
// checkpoint lands canonical, the epoch proves, and the proven tip advances.
//
// This is a prover-backed regression: the base invalidation suite starts no prover node and A-1351
// produces no on-chain event, so proven-tip advancement is the only observable signal. Modelled on
// block-production/proof_boundary.parallel.test.ts (createProverNode + Delayer). To reproduce the red
// state, revert the three A-1351 normalization layers (orderAttestations, the attestation pool ingress,
// CheckpointAttestation.withNormalizedSignature) and the packAttestations v-canonicalization. The proven
// tip then stays at 0 and the test times out: on a pre-A-1401 tree the proof tx is sent but reverts on L1
// (ECDSA.recover), while on this branch A-1401's own detection invalidates the non-canonical checkpoint
// before it can be proven. Either way, without A-1351 the epoch never proves.
describe('multi-node/invalid-attestations/yparity_attestation_proving', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let test: MultiNodeTestContext;
  let validators: RegisteredValidator[];
  let proverNode: AztecNodeService;

  afterEach(async () => {
    jest.restoreAllMocks();
    await test?.teardown();
  });

  it('proves an epoch when a committee member emits yParity attestations', async () => {
    validators = buildMockGossipValidators(NODE_COUNT);
    test = await MultiNodeTestContext.setup({
      ...MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
      ...MULTI_VALIDATOR_BLOCK_PRODUCTION_TIMING,
      initialValidators: validators,
      aztecProofSubmissionEpochs: 1,
    });
    ({ context, logger } = test);

    // node 0 is the malicious committee member (rewrites its own attestations to yParity form); the rest
    // are honest. One malicious member out of three still leaves quorum, so checkpoints keep landing.
    logger.warn(`Starting ${NODE_COUNT} validator nodes (node 0 emits yParity attestations)`);
    await asyncMap(validators, ({ privateKey }, i) =>
      test.createValidatorNode([privateKey], {
        minTxsPerBlock: 0,
        maxTxsPerBlock: 1,
        injectYParityOwnAttestation: i === 0,
      }),
    );

    proverNode = await test.createProverNode({ cancelTxOnTimeout: false, maxSpeedUpAttempts: 0, dontStart: true });
    context.proverNode = proverNode;
    await proverNode.getProverNode()!.start();
    const proverDelayer: Delayer = proverNode.getProverNode()!.getDelayer()!;

    // Let the chain build the first checkpoint, produced while the malicious member is gossiping.
    await test.waitUntilCheckpointNumber(CheckpointNumber(1), test.L2_SLOT_DURATION_IN_S * 6);

    // Advance the L1 clock by a full epoch so epoch 0 becomes provable, keeping the interval miner running.
    const block = await test.l1Client.getBlock({ includeTransactions: false });
    const warpTo = Number(block.timestamp) + test.epochDuration * test.L2_SLOT_DURATION_IN_S;
    logger.warn(`Warping L1 to ${warpTo} to make epoch 0 provable`);
    await test.context.cheatCodes.eth.warp(warpTo, { resetBlockInterval: true });

    // The prover must submit a proof AND the on-chain proven tip must advance past genesis. In the red
    // state (A-1351 reverted) the proof tx is still sent but reverts, so the proven tip stays at 0.
    await retryUntil(
      async () => {
        await test.monitor.run(true);
        const provenNumber = await test.rollup.getProvenCheckpointNumber();
        return proverDelayer.getSentTxHashes().length > 0 && Number(provenNumber) >= 1;
      },
      'prover advances L1 proven checkpoint despite yParity attestations',
      test.L2_SLOT_DURATION_IN_S * 16,
      1,
    );

    expect(proverDelayer.getSentTxHashes().length).toBeGreaterThan(0);
    expect(Number(await test.rollup.getProvenCheckpointNumber())).toBeGreaterThanOrEqual(1);

    logger.warn(`Test succeeded '${expect.getState().currentTestName}'`);
  });
});
