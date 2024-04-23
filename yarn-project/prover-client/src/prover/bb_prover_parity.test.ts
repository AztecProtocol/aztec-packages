import {
  BaseParityInputs,
  Fr,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type RECURSIVE_PROOF_LENGTH_IN_FIELDS,
  type RootParityInput,
  RootParityInputs,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { createDebugLogger } from '@aztec/foundation/log';
import { type Tuple } from '@aztec/foundation/serialize';

import { type MemDown, default as memdown } from 'memdown';

import { TestContext } from '../mocks/test_context.js';
import { BBNativeRollupProver, type BBProverConfig } from './bb_prover.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

const logger = createDebugLogger('aztec:bb-prover-parity');

describe('prover/bb_prover/parity', () => {
  let context: TestContext;
  let bbProver: BBNativeRollupProver;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      bbConfig.circuitFilter = ['BaseParityArtifact', 'RootParityArtifact'];
      bbProver = await BBNativeRollupProver.new(bbConfig);
      return bbProver;
    };
    context = await TestContext.new(logger, buildProver);
  }, 60_000);

  afterAll(async () => {
    //await context.cleanup();
  }, 5000);

  it('proves the parity circuits', async () => {
    const l1ToL2Messages = makeTuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>(
      NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
      Fr.zero,
    );
    const baseParityInputs = Array.from({ length: NUM_BASE_PARITY_PER_ROOT_PARITY }, (_, i) =>
      BaseParityInputs.fromSlice(l1ToL2Messages, i),
    );

    // Generate the base parity proofs
    const rootInputs = await Promise.all(
      baseParityInputs.map(baseInputs => context.prover.getBaseParityProof(baseInputs)),
    );

    // Verify the base parity proofs
    await expect(
      Promise.all(rootInputs.map(input => context.prover.verifyProof('BaseParityArtifact', input.proof.binaryProof))),
    ).resolves.not.toThrow();

    //const vk = await bbProver.getVerificationKeyForCircuit('BaseParityArtifact');

    // Now generate the root parity proof
    const rootParityInputs: RootParityInputs = new RootParityInputs(
      rootInputs as Tuple<
        RootParityInput<typeof RECURSIVE_PROOF_LENGTH_IN_FIELDS>,
        typeof NUM_BASE_PARITY_PER_ROOT_PARITY
      >,
    );
    const rootOutput = await context.prover.getRootParityProof(rootParityInputs);

    // Verify the root parity proof
    await expect(context.prover.verifyProof('RootParityArtifact', rootOutput.proof.binaryProof)).resolves.not.toThrow();
  }, 100_000);
});
