import {
  BaseParityInputs,
  Fr,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  RootParityInput,
  RootParityInputs,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { createDebugLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';

import * as fs from 'fs/promises';
import { type MemDown, default as memdown } from 'memdown';

import { getConfig } from '../mocks/fixtures.js';
import { BBNativeRollupProver, type BBProverConfig } from './bb_prover.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:bb-prover-test');

describe('prover/bb_prover', () => {
  let prover: BBNativeRollupProver;
  let directoryToCleanup: string | undefined;

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

  afterAll(async () => {
    if (directoryToCleanup) {
      await fs.rm(directoryToCleanup, { recursive: true, force: true });
    }
  }, 5000);

  it('proves the parity circuits', async () => {
    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.random,
    );
    const baseParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }, (_, i) =>
      BaseParityInputs.fromSlice(l1ToL2Messages, i),
    );

    // Generate the base parity proofs
    const rootInputs = await Promise.all(baseParityInputs.map(baseInputs => prover.getBaseParityProof(baseInputs)));

    // Verify the base parity proofs
    await expect(
      Promise.all(rootInputs.map(input => prover.verifyProof('BaseParityArtifact', input[1]))),
    ).resolves.not.toThrow();

    // Now generate the root parity proof
    const rootChildrenInputs = rootInputs.map(rootInput => {
      const child: RootParityInput = new RootParityInput(rootInput[1], rootInput[0]);
      return child;
    });
    const rootParityInputs: RootParityInputs = new RootParityInputs(
      rootChildrenInputs as Tuple<RootParityInput, typeof NUM_BASE_PARITY_PER_ROOT_PARITY>,
    );
    const rootOutput = await prover.getRootParityProof(rootParityInputs);

    // Verify the root parity proof
    await expect(prover.verifyProof('RootParityArtifact', rootOutput[1])).resolves.not.toThrow();
  }, 100_000);
});
