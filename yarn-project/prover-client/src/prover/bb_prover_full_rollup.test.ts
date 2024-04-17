import { PROVING_STATUS, makeEmptyProcessedTx, mockTx } from '@aztec/circuit-types';
import { Fr, type GlobalVariables, Header } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type MerkleTreeOperations, MerkleTrees, type TreeInfo } from '@aztec/world-state';

import * as fs from 'fs/promises';
import { type MemDown, default as memdown } from 'memdown';

import { getConfig, makeGlobals } from '../mocks/fixtures.js';
import { TestPublicProcessor } from '../mocks/test_public_processor.js';
import { ProvingOrchestrator } from '../orchestrator/orchestrator.js';
import { BBNativeRollupProver, type BBProverConfig } from './bb_prover.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:bb-prover-test');

describe('prover/bb_prover', () => {
  let orchestrator: ProvingOrchestrator;
  let builderDb: MerkleTreeOperations;
  let prover: BBNativeRollupProver;
  let directoryToCleanup: string | undefined;
  let processor: TestPublicProcessor;
  let root: Buffer;

  let blockNumber: number;

  let globalVariables: GlobalVariables;

  beforeAll(async () => {
    const config = await getConfig(logger);
    if (!config) {
      throw new Error(`BB and ACVM binaries must be present to test the BB Prover`);
    }
    directoryToCleanup = config.directoryToCleanup;
    const bbConfig: BBProverConfig = {
      acvmBinaryPath: config.expectedAcvmPath,
      acvmWorkingDirectory: config.acvmWorkingDirectory,
      bbBinaryPath: config.expectedBBPath,
      bbWorkingDirectory: config.bbWorkingDirectory,
    };
    prover = await BBNativeRollupProver.new(bbConfig);
  }, 60_000);

  beforeEach(async () => {
    blockNumber = 3;
    globalVariables = makeGlobals(blockNumber);

    processor = TestPublicProcessor.new();

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    root = Buffer.alloc(32, 5);
    processor.db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);

    orchestrator = await ProvingOrchestrator.new(builderDb, prover);
  }, 60_000);

  afterAll(async () => {
    if (directoryToCleanup) {
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  }, 5000);

  it('proves all circuits', async () => {
    const numTransactions = 4;
    const txs = times(numTransactions, (i: number) =>
      mockTx(1000 * (i + 1), {
        numberOfNonRevertiblePublicCallRequests: 2,
        numberOfRevertiblePublicCallRequests: 1,
      }),
    );
    for (const tx of txs) {
      tx.data.constants.historicalHeader = await builderDb.buildInitialHeader();
    }

    const provingTicket = await orchestrator.startNewBlock(
      numTransactions,
      globalVariables,
      [],
      makeEmptyProcessedTx(Header.empty(), new Fr(1234), new Fr(1)),
    );

    const [processed, _] = await processor.process(txs, numTransactions, orchestrator);

    expect(processed.length).toBe(numTransactions);

    await orchestrator.setBlockCompleted();

    const provingResult = await provingTicket.provingPromise;

    expect(provingResult.status).toBe(PROVING_STATUS.SUCCESS);

    const blockResult = await orchestrator.finaliseBlock();

    await expect(prover.verifyProof('RootRollupArtifact', blockResult.proof)).resolves.not.toThrow();

    await orchestrator.stop();
  }, 600_000);
});
