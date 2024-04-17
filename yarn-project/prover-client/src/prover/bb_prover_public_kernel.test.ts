import { PublicKernelType, mockTx } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/utils';
import { type ServerProtocolArtifact } from '@aztec/noir-protocol-circuits-types';
import { type MerkleTreeOperations, MerkleTrees, type TreeInfo } from '@aztec/world-state';

import * as fs from 'fs/promises';
import { type MemDown, default as memdown } from 'memdown';

import { getConfig } from '../mocks/fixtures.js';
import { TestPublicProcessor } from '../mocks/test_public_processor.js';
import { BBNativeRollupProver, type BBProverConfig } from './bb_prover.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:bb-prover-test');

describe('prover/bb_prover', () => {
  let builderDb: MerkleTreeOperations;
  let prover: BBNativeRollupProver;
  let directoryToCleanup: string | undefined;
  let processor: TestPublicProcessor;
  let root: Buffer;

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
      circuitFilter: [
        'PublicKernelAppLogicArtifact',
        'PublicKernelSetupArtifact',
        'PublicKernelTailArtifact',
        'PublicKernelTeardownArtifact',
      ],
    };
    prover = await BBNativeRollupProver.new(bbConfig);
  }, 120_000);

  beforeEach(async () => {
    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());

    processor = TestPublicProcessor.new();
    root = Buffer.alloc(32, 5);
    processor.db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
  }, 60_000);

  afterAll(async () => {
    if (directoryToCleanup) {
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  }, 5000);

  it('proves the public kernel circuits', async () => {
    const tx = mockTx(1000, {
      numberOfNonRevertiblePublicCallRequests: 2,
      numberOfRevertiblePublicCallRequests: 1,
    });
    tx.data.constants.historicalHeader = await builderDb.buildInitialHeader();

    const [processed, _] = await processor.process([tx], 1, undefined);

    expect(processed.length).toBe(1);
    const processedTx = processed[0];
    expect(processedTx.publicKernelRequests.map(r => r.type)).toEqual([
      PublicKernelType.SETUP,
      PublicKernelType.APP_LOGIC,
      PublicKernelType.TEARDOWN,
      PublicKernelType.TAIL,
    ]);

    for (const request of processedTx.publicKernelRequests) {
      if (request.type === PublicKernelType.TAIL) {
        logger.info(`Proving tail circuit`);
        const [_, proof] = await prover.getPublicTailProof(request);
        logger.info(`Verifying tail circuit`);
        await prover.verifyProof('PublicKernelTailArtifact', proof);
        continue;
      }
      logger.info(`Proving kernel type: ${PublicKernelType[request.type]}`);
      const [_, proof] = await prover.getPublicKernelProof(request);
      const artifact: ServerProtocolArtifact =
        request.type === PublicKernelType.SETUP
          ? 'PublicKernelSetupArtifact'
          : request.type === PublicKernelType.APP_LOGIC
          ? 'PublicKernelAppLogicArtifact'
          : 'PublicKernelTeardownArtifact';
      logger.info(`Verifying artifact type: ${artifact}`);
      await prover.verifyProof(artifact, proof);
    }
  }, 60_000);
});
