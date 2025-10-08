import { NESTED_RECURSIVE_PROOF_LENGTH, RECURSIVE_PROOF_LENGTH } from '@aztec/constants';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import { createBlockEndMarker } from '@aztec/stdlib/block';
import {
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { ParityPublicInputs } from '@aztec/stdlib/parity';
import { ClientIvcProof, makeRecursiveProof } from '@aztec/stdlib/proofs';
import { makeParityPublicInputs } from '@aztec/stdlib/testing';
import { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs, buildFinalBlobChallenges } from './block-building-helpers.js';
import type { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-workflow');

describe('prover/orchestrator', () => {
  describe('workflow', () => {
    let orchestrator: ProvingOrchestrator;
    let context: TestContext;

    describe('with mock prover', () => {
      let mockProver: MockProxy<ServerCircuitProver>;

      beforeEach(async () => {
        mockProver = mock<ServerCircuitProver>();
        context = await TestContext.new(logger, {
          proverCount: 4,
          createProver: () => Promise.resolve(mockProver),
        });
        ({ orchestrator } = context);
      });

      it('calls root parity circuit only when ready', async () => {
        // create a custom L2 to L1 message
        const message = Fr.random();

        // and delay its proof
        const pendingBaseParityResult =
          promiseWithResolvers<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>>();
        const expectedBaseParityResult = makePublicInputsAndRecursiveProof(
          makeParityPublicInputs(0xff),
          makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
          ProtocolCircuitVks.ParityBaseArtifact,
        );

        mockProver.getRootParityProof.mockResolvedValue(
          makePublicInputsAndRecursiveProof(
            makeParityPublicInputs(),
            makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
            ProtocolCircuitVks.ParityRootArtifact,
          ),
        );

        mockProver.getBaseParityProof.mockImplementation(inputs => {
          if (inputs.msgs[0].equals(message)) {
            return pendingBaseParityResult.promise;
          } else {
            return Promise.resolve(
              makePublicInputsAndRecursiveProof(
                makeParityPublicInputs(),
                makeRecursiveProof(RECURSIVE_PROOF_LENGTH),
                ProtocolCircuitVks.ParityBaseArtifact,
              ),
            );
          }
        });

        const blobFields = [createBlockEndMarker(0)];
        const finalBlobChallenges = await buildFinalBlobChallenges([blobFields]);

        orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
        await orchestrator.startNewCheckpoint(
          0, // checkpointIndex
          context.getCheckpointConstants(),
          [message],
          1,
          blobFields.length,
          context.getPreviousBlockHeader(),
        );
        await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, 1);

        // the prover broker deduplicates jobs, so the base parity proof
        // for the three sets empty messages is called only once. so total
        // calls is one for the empty messages and one for the custom message.
        await sleep(2000);
        expect(mockProver.getBaseParityProof).toHaveBeenCalledTimes(2);
        expect(mockProver.getRootParityProof).not.toHaveBeenCalled();

        // only after the base parity proof is resolved, the root parity should be called
        pendingBaseParityResult.resolve(expectedBaseParityResult);

        // give the orchestrator a chance to calls its callbacks
        await sleep(5000);
        expect(mockProver.getRootParityProof).toHaveBeenCalledTimes(1);

        orchestrator.cancel();
      });
    });

    describe('with simulated prover', () => {
      let prover: ServerCircuitProver;

      beforeEach(async () => {
        context = await TestContext.new(logger);
        ({ prover, orchestrator } = context);
      });

      it('waits for block to be completed before enqueueing block root proof', async () => {
        const { txs } = await context.makePendingBlock(2);
        const {
          blobFieldsLengths: [blobFieldsLength],
          finalBlobChallenges,
        } = await buildBlobDataFromTxs([txs]);
        orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
        await orchestrator.startNewCheckpoint(
          0, // checkpointIndex
          context.getCheckpointConstants(),
          [],
          1, // numBlocks
          blobFieldsLength,
          context.getPreviousBlockHeader(),
        );
        await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);
        await orchestrator.addTxs(txs);

        // wait for the block root proof to try to be enqueued
        await sleep(1000);

        // now finish the block
        await orchestrator.setBlockCompleted(context.blockNumber);

        const result = await orchestrator.finalizeEpoch();
        expect(result.proof).toBeDefined();
      });

      it('can start tube proofs before adding processed txs', async () => {
        const getTubeSpy = jest.spyOn(prover, 'getPublicTubeProof');
        const { txs: processedTxs } = await context.makePendingBlock(2);
        const {
          blobFieldsLengths: [blobFieldsLength],
          finalBlobChallenges,
        } = await buildBlobDataFromTxs([processedTxs]);
        orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
        await orchestrator.startNewCheckpoint(
          0, // checkpointIndex
          context.getCheckpointConstants(),
          [],
          1, // numBlocks
          blobFieldsLength,
          context.getPreviousBlockHeader(),
        );

        processedTxs.forEach(tx => (tx.clientIvcProof = ClientIvcProof.random()));
        const txs = processedTxs.map(tx =>
          Tx.from({
            txHash: tx.hash,
            data: tx.data,
            clientIvcProof: tx.clientIvcProof,
            contractClassLogFields: [],
            publicFunctionCalldata: [],
          }),
        );
        await orchestrator.startTubeCircuits(txs);

        await sleep(100);
        expect(getTubeSpy).toHaveBeenCalledTimes(2);
        getTubeSpy.mockReset();

        await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, processedTxs.length);
        await orchestrator.addTxs(processedTxs);
        await orchestrator.setBlockCompleted(context.blockNumber);
        const result = await orchestrator.finalizeEpoch();
        expect(result.proof).toBeDefined();
        expect(getTubeSpy).toHaveBeenCalledTimes(0);
      });

      it('can add checkpoints in arbitrary order', async () => {
        const numCheckpoints = 3;
        const numBlocksPerCheckpoint = 2;
        const numTxsPerBlock = 2;
        const checkpoints = await timesAsync(numCheckpoints, i =>
          context.makePendingBlocksInCheckpoint(numBlocksPerCheckpoint, {
            checkpointIndex: i,
            numTxsPerBlock,
          }),
        );
        const finalBlobChallenges = await buildFinalBlobChallenges(checkpoints.map(c => c.blobFields));

        context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

        // Start checkpoint in reverse order.
        for (let checkpointIndex = numCheckpoints - 1; checkpointIndex >= 0; checkpointIndex--) {
          const { blocks, blobFields, l1ToL2Messages } = checkpoints[checkpointIndex];
          await context.orchestrator.startNewCheckpoint(
            checkpointIndex,
            context.getCheckpointConstants(checkpointIndex),
            l1ToL2Messages,
            blocks.length,
            blobFields.length,
            context.getPreviousBlockHeader(blocks[0].header.globalVariables.blockNumber),
          );

          // Blocks in a checkpoint need to be started in order.
          for (const block of blocks) {
            const { txs } = block;
            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, txs.length);
            await context.orchestrator.addTxs(txs);
            await context.orchestrator.setBlockCompleted(blockNumber);
          }
        }

        logger.info('Finalizing epoch');
        const epoch = await context.orchestrator.finalizeEpoch();
        expect(epoch.proof).toBeDefined();
      });
    });
  });
});
