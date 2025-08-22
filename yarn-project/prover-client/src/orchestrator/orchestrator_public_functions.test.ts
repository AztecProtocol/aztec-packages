import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { getBlockBlobFields } from '@aztec/stdlib/block';
import { mockTx } from '@aztec/stdlib/testing';

import TOML from '@iarna/toml';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-public-functions');

describe('prover/orchestrator/public-functions', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('blocks with public functions', () => {
    let testCount = 1;
    const maybeSkip = isGenerateTestDataEnabled() ? it.skip : it;

    maybeSkip('builds an L2 block with 0 non-revertible and 1 revertible call that reverts', async () => {
      const tx = await mockTx(1000 * testCount++, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 1,
      });
      tx.data.constants.historicalHeader = context.getBlockHeader(0);
      tx.data.constants.vkTreeRoot = getVKTreeRoot();
      tx.data.constants.protocolContractTreeRoot = protocolContractTreeRoot;
      await tx.recomputeHash();

      // Since this TX is mocked/garbage, it will revert because it calls a non-existent contract,
      // but it reverts in app logic so it can still be included.
      const [processed, _] = await context.processPublicFunctions([tx], 1);
      const blobFields = getBlockBlobFields(processed.flatMap(tx => tx.txEffect));
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1 /* numCheckpoints */, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1, // numBlocks
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(
        context.blockNumber,
        context.globalVariables.timestamp,
        processed.length,
      );

      await context.orchestrator.addTxs(processed);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });

    it('generates public base test data', async () => {
      if (!isGenerateTestDataEnabled()) {
        return;
      }

      const tx = await mockTx(1234, {
        numberOfRevertiblePublicCallRequests: 1,
      });
      tx.data.constants.historicalHeader = context.getBlockHeader(0);
      tx.data.constants.vkTreeRoot = getVKTreeRoot();
      tx.data.constants.protocolContractTreeRoot = protocolContractTreeRoot;

      const [processed, _] = await context.processPublicFunctions([tx], 1);
      const blobFields = getBlockBlobFields(processed.flatMap(tx => tx.txEffect));
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
      context.orchestrator.startNewEpoch(1, 1 /* numCheckpoints */, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1, // numBlocks
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(
        context.blockNumber,
        context.globalVariables.timestamp,
        processed.length,
      );
      await context.orchestrator.addTxs(processed);
      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
      const data = getTestData('rollup-base-public');
      if (data) {
        updateProtocolCircuitSampleInputs('rollup-base-public', TOML.stringify(data[0] as any));
      }
    });
  });
});
