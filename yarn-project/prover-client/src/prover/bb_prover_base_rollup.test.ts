import { type GlobalVariables } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import * as fs from 'fs/promises';
import { type MemDown, default as memdown } from 'memdown';

import { getConfig, makeBloatedProcessedTx, makeGlobals } from '../mocks/fixtures.js';
import { buildBaseRollupInput } from '../orchestrator/block-building-helpers.js';
import { BBNativeRollupProver, type BBProverConfig } from './bb_prover.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:bb-prover-test');

describe('prover/bb_prover', () => {
  let builderDb: MerkleTreeOperations;
  let prover: BBNativeRollupProver;
  let directoryToCleanup: string | undefined;

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

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
  }, 60_000);

  afterAll(async () => {
    if (directoryToCleanup) {
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  }, 5000);

  it('proves the base rollup', async () => {
    const tx = await makeBloatedProcessedTx(builderDb, 1);

    logger.verbose('Building base rollup inputs');
    const baseRollupInputs = await buildBaseRollupInput(tx, globalVariables, builderDb);
    logger.verbose('Proving base rollups');
    const proofOutputs = await prover.getBaseRollupProof(baseRollupInputs);
    logger.verbose('Verifying base rollups');
    await expect(prover.verifyProof('BaseRollupArtifact', proofOutputs[1])).resolves.not.toThrow();
  }, 200_000);
});
