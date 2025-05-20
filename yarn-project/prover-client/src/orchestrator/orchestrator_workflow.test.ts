import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { NESTED_RECURSIVE_PROOF_LENGTH, RECURSIVE_PROOF_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import {
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makePublicInputsAndRecursiveProof,
} from '@aztec/stdlib/interfaces/server';
import type { ParityPublicInputs } from '@aztec/stdlib/parity';
import { ClientIvcProof, makeRecursiveProof } from '@aztec/stdlib/proofs';
import { makeParityPublicInputs } from '@aztec/stdlib/testing';
import type { BlockHeader, GlobalVariables, Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { TestContext } from '../mocks/test_context.js';
import type { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-workflow');

describe('prover/orchestrator', () => {
  describe('workflow', () => {
    let orchestrator: ProvingOrchestrator;
    let globalVariables: GlobalVariables;
    let previousBlockHeader: BlockHeader;
    let context: TestContext;

    describe('with mock prover', () => {
      let mockProver: MockProxy<ServerCircuitProver>;

      beforeEach(async () => {
        mockProver = mock<ServerCircuitProver>();
        context = await TestContext.new(logger, 4, () => Promise.resolve(mockProver));
        ({ orchestrator, globalVariables } = context);
        previousBlockHeader = context.getPreviousBlockHeader();
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
          ProtocolCircuitVks.BaseParityArtifact,
        );

        mockProver.getRootParityProof.mockResolvedValue(
          makePublicInputsAndRecursiveProof(
            makeParityPublicInputs(),
            makeRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH),
            ProtocolCircuitVks.RootParityArtifact,
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
                ProtocolCircuitVks.BaseParityArtifact,
              ),
            );
          }
        });

        const emptyChallenges = await BatchedBlob.precomputeEmptyBatchedBlobChallenges();

        orchestrator.startNewEpoch(1, 1, 1, emptyChallenges);
        await orchestrator.startNewBlock(globalVariables, [message], previousBlockHeader);

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
        ({ prover, orchestrator, globalVariables } = context);
        previousBlockHeader = context.getPreviousBlockHeader();
      });

      it('waits for block to be completed before enqueueing block root proof', async () => {
        const txs = await Promise.all([context.makeProcessedTx(1), context.makeProcessedTx(2)]);
        const blobs = await Blob.getBlobs(txs.map(tx => tx.txEffect.toBlobFields()).flat());
        const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
        orchestrator.startNewEpoch(1, 1, 1, finalBlobChallenges);
        await orchestrator.startNewBlock(globalVariables, [], previousBlockHeader);
        await context.setTreeRoots(txs);
        await orchestrator.addTxs(txs);

        // wait for the block root proof to try to be enqueued
        await sleep(1000);

        // now finish the block
        await orchestrator.setBlockCompleted(context.blockNumber);

        const result = await orchestrator.finaliseEpoch();
        expect(result.proof).toBeDefined();
      });

      it('can start tube proofs before adding processed txs', async () => {
        const getTubeSpy = jest.spyOn(prover, 'getTubeProof');
        const processedTxs = await Promise.all([context.makeProcessedTx(1), context.makeProcessedTx(2)]);
        const blobs = await Blob.getBlobs(processedTxs.map(tx => tx.txEffect.toBlobFields()).flat());
        const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
        orchestrator.startNewEpoch(1, 1, 1, finalBlobChallenges);

        processedTxs.forEach((tx, i) => (tx.clientIvcProof = ClientIvcProof.fake(i + 1)));
        // TODO(AD): we shouldn't be mocking complex objects like tx this way - easy to hit issues (I had to update to add data field)
        const txs = processedTxs.map(
          tx => ({ getTxHash: () => Promise.resolve(tx.hash), clientIvcProof: tx.clientIvcProof, data: {} }) as Tx,
        );
        await orchestrator.startTubeCircuits(txs);

        await sleep(100);
        expect(getTubeSpy).toHaveBeenCalledTimes(2);
        getTubeSpy.mockReset();

        await orchestrator.startNewBlock(globalVariables, [], previousBlockHeader);
        await context.setTreeRoots(processedTxs);
        await orchestrator.addTxs(processedTxs);
        await orchestrator.setBlockCompleted(context.blockNumber);
        const result = await orchestrator.finaliseEpoch();
        expect(result.proof).toBeDefined();
        expect(getTubeSpy).toHaveBeenCalledTimes(0);
      });
    });
  });
});
