import { createLogger } from '@aztec/foundation/log';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { mockTx } from '@aztec/stdlib/testing';

import TOML from '@iarna/toml';

import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs } from './block-building-helpers.js';

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
      tx.data.constants.anchorBlockHeader = context.getBlockHeader(0);
      tx.data.constants.vkTreeRoot = getVKTreeRoot();
      tx.data.constants.protocolContractsHash = protocolContractsHash;
      await tx.recomputeHash();

      // Since this TX is mocked/garbage, it will revert because it calls a non-existent contract,
      // but it reverts in app logic so it can still be included.
      const [processed, _] = await context.processPublicFunctions([tx]);
      const {
        blobFieldsLengths: [blobFieldsLength],
        finalBlobChallenges,
      } = await buildBlobDataFromTxs([processed]);

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1 /* numCheckpoints */, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        context.getCheckpointConstants(),
        [],
        1, // numBlocks
        blobFieldsLength,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(
        context.blockNumber,
        context.globalVariables.timestamp,
        processed.length,
      );

      await context.orchestrator.addTxs(processed);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });

    it('generates public base test data', async () => {
      if (!isGenerateTestDataEnabled()) {
        return;
      }

      const tx = await mockTx(1234, {
        numberOfRevertiblePublicCallRequests: 1,
      });
      tx.data.constants.anchorBlockHeader = context.getBlockHeader(0);
      tx.data.constants.vkTreeRoot = getVKTreeRoot();
      tx.data.constants.protocolContractsHash = protocolContractsHash;

      const [processed, _] = await context.processPublicFunctions([tx]);
      const {
        blobFieldsLengths: [blobFieldsLength],
        finalBlobChallenges,
      } = await buildBlobDataFromTxs([processed]);
      context.orchestrator.startNewEpoch(1, 1 /* numCheckpoints */, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        context.getCheckpointConstants(),
        [],
        1, // numBlocks
        blobFieldsLength,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(
        context.blockNumber,
        context.globalVariables.timestamp,
        processed.length,
      );
      await context.orchestrator.addTxs(processed);
      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
      const data = getTestData('rollup-tx-base-public');
      if (data) {
        updateProtocolCircuitSampleInputs('rollup-tx-base-public', TOML.stringify(data[0] as any));
      }
    });
  });
});
