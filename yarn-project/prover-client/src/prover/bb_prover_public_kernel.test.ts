import { PublicKernelType, mockTx } from '@aztec/circuit-types';
import { Proof, makeEmptyProof } from '@aztec/circuits.js';
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

describe('prover/bb_prover/public-kernel', () => {
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
  }, 30_000);

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

    const [processed, failed] = await processor.process([tx], 1, undefined);

    expect(processed.length).toBe(1);
    expect(failed.length).toBe(0);
    const processedTx = processed[0];
    expect(processedTx.publicKernelRequests.map(r => r.type)).toEqual([
      PublicKernelType.SETUP,
      PublicKernelType.APP_LOGIC,
      PublicKernelType.TEARDOWN,
      PublicKernelType.TAIL,
    ]);

    const getArtifactForPublicKernel = (type: PublicKernelType): ServerProtocolArtifact => {
      switch (type) {
        case PublicKernelType.NON_PUBLIC:
          throw new Error(`Can't prove non-public kernels`);
        case PublicKernelType.SETUP:
          return 'PublicKernelSetupArtifact';
        case PublicKernelType.APP_LOGIC:
          return 'PublicKernelAppLogicArtifact';
        case PublicKernelType.TEARDOWN:
          return 'PublicKernelTeardownArtifact';
        case PublicKernelType.TAIL:
          return 'PublicKernelTailArtifact';
      }
    };

    for (const request of processedTx.publicKernelRequests) {
      const artifact = getArtifactForPublicKernel(request.type);
      logger.verbose(`Proving kernel type: ${PublicKernelType[request.type]}`);
      let proof: Proof = makeEmptyProof();
      if (request.type === PublicKernelType.TAIL) {
        await expect(
          prover.getPublicTailProof(request).then(result => {
            proof = result[1];
          }),
        ).resolves.not.toThrow();
      } else {
        await expect(
          prover.getPublicKernelProof(request).then(result => {
            proof = result[1];
          }),
        ).resolves.not.toThrow();
      }

      logger.verbose(`Verifying kernel type: ${PublicKernelType[request.type]}`);
      await expect(prover.verifyProof(artifact, proof)).resolves.not.toThrow();
    }
  }, 60_000);
});
