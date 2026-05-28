import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type DimensionName,
  type PrivateKernelResetDimensions,
  privateKernelResetDimensionNames,
} from '@aztec/stdlib/kernel';
import { NullifierMembershipWitness } from '@aztec/stdlib/trees';

import { mock } from 'jest-mock-extended';
import times from 'lodash.times';

import type { PrivateKernelOracle } from '../private_kernel_oracle.js';
import { PrivateKernelResetPrivateInputsBuilder } from './private_kernel_reset_private_inputs_builder.js';
import {
  PrivateCircuitPublicInputsBuilder,
  PrivateKernelCircuitPublicInputsBuilder,
  makeExecutionResult,
  makeKernelOutput,
} from './test_utils.js';

/**
 * Generate a random integer between value and toValue (inclusive).
 * If toValue is not provided, the random integer is between 0 and value (inclusive).
 */
function randomInt(value: number, toValue?: number) {
  const from = toValue !== undefined ? value : 0;
  const to = toValue ?? value;
  return from + Math.floor(Math.random() * (to - from + 1));
}

describe('PrivateKernelResetPrivateInputsBuilder', () => {
  let oracle: ReturnType<typeof mock<PrivateKernelOracle>>;
  let kernel: PrivateKernelCircuitPublicInputsBuilder;
  let noteHashNullifierCounterMap: Map<number, number>;
  let splitCounter: number;

  beforeEach(() => {
    kernel = new PrivateKernelCircuitPublicInputsBuilder();
    noteHashNullifierCounterMap = new Map();
    splitCounter = 0;
    oracle = mock<PrivateKernelOracle>();
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));
    oracle.getNoteHashMembershipWitness.mockResolvedValue(MembershipWitness.random(NOTE_HASH_TREE_HEIGHT));
    oracle.getNullifierMembershipWitness.mockResolvedValue(NullifierMembershipWitness.random());
    oracle.getMasterSecretKey.mockResolvedValue(Fr.random() as unknown as GrumpkinScalar);
  });

  describe('no next iteration (final reset)', () => {
    const makeResetBuilder = () =>
      new PrivateKernelResetPrivateInputsBuilder(
        makeKernelOutput(kernel.build()),
        [],
        noteHashNullifierCounterMap,
        splitCounter,
      );

    const expectDimensions = (
      builder: PrivateKernelResetPrivateInputsBuilder,
      actualDimensions: PrivateKernelResetDimensions,
      expectedDimensions: Partial<{ [K in DimensionName]: number }>,
    ) => {
      const requested = builder.getRequestedDimensions();
      for (const [name, value] of Object.entries(expectedDimensions)) {
        if (value === 0) {
          throw new Error(
            `Dimension ${name} is 0. Check the test fixtures to ensure the target dimension is non-zero.`,
          );
        }
        const key = name as DimensionName;
        // Requested dimensions must match exactly.
        expect(requested[key]).toBe(value);
        // Actual dimensions (from config) must be at least as large.
        expect(actualDimensions[key]).toBeGreaterThanOrEqual(value);
      }
    };

    it('does not need reset when no data present', async () => {
      const builder = makeResetBuilder();
      expect(builder.needsReset()).toBe(false);

      // Throws if attempting to build.
      await expect(builder.build(oracle)).rejects.toThrow('Reset is not required.');
    });

    it('throws when building without calling needsReset', async () => {
      kernel.addSettledNoteHashReadRequest();
      const builder = makeResetBuilder();
      await expect(builder.build(oracle)).rejects.toThrow('Reset is not required.');
    });

    describe('note hash read requests', () => {
      it('resets pending reads', async () => {
        const numReads = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
        times(numReads, i =>
          kernel.addNoteHash({ value: new Fr(1 + i) }).addPendingNoteHashReadRequest({ value: new Fr(1 + i) }),
        );

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { NOTE_HASH_PENDING_READ: numReads });
      });

      it('resets settled reads', async () => {
        const numReads = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
        times(numReads, () => kernel.addSettledNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { NOTE_HASH_SETTLED_READ: numReads });
        expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(numReads);
      });

      it('resets both pending and settled reads', async () => {
        const numPending = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX - 1);
        const numSettled = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numPending);
        times(numPending, i =>
          kernel.addNoteHash({ value: new Fr(i + 1) }).addPendingNoteHashReadRequest({ value: new Fr(i + 1) }),
        );
        times(numSettled, () => kernel.addSettledNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, {
          NOTE_HASH_PENDING_READ: numPending,
          NOTE_HASH_SETTLED_READ: numSettled,
        });
        expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(numSettled);
      });

      it('throws when settled read request has no matching membership witness', async () => {
        kernel.addSettledNoteHashReadRequest();

        oracle.getNoteHashMembershipWitness.mockResolvedValue(undefined);

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        await expect(builder.build(oracle)).rejects.toThrow('Read request is reading an unknown note hash.');
      });

      it('throws when pending read request has no matching note hash', () => {
        kernel.addPendingNoteHashReadRequest({ value: new Fr(999) });

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('No matching note hash found for note hash read request.');
      });
    });

    describe('nullifier read requests', () => {
      it('resets pending reads', async () => {
        const numReads = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX);
        times(numReads, i => {
          kernel.addNullifier({ value: new Fr(1 + i) });
          kernel.addPendingNullifierReadRequest({ value: new Fr(1 + i) });
        });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { NULLIFIER_PENDING_READ: numReads });
      });

      it('resets settled reads', async () => {
        const numReads = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX);
        times(numReads, () => kernel.addSettledNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { NULLIFIER_SETTLED_READ: numReads });
        expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(numReads);
      });

      it('resets both pending and settled reads', async () => {
        const numPending = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX - 1);
        const numSettled = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX - numPending);
        times(numPending, i => {
          kernel.addNullifier({ value: new Fr(1 + i) });
          kernel.addPendingNullifierReadRequest({ value: new Fr(1 + i) });
        });
        times(numSettled, () => kernel.addSettledNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, {
          NULLIFIER_PENDING_READ: numPending,
          NULLIFIER_SETTLED_READ: numSettled,
        });
        expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(numSettled);
      });

      it('throws when settled read request has no matching membership witness', async () => {
        kernel.addSettledNullifierReadRequest();

        oracle.getNullifierMembershipWitness.mockResolvedValue(undefined);

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        await expect(builder.build(oracle)).rejects.toThrow('Cannot find the leaf for nullifier');
      });

      it('throws when pending read request has no matching nullifier', () => {
        kernel.addPendingNullifierReadRequest({ value: new Fr(999) });

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('No matching nullifier found for nullifier read request.');
      });
    });

    describe('key validation requests', () => {
      it('resets key validation requests and invokes oracle', async () => {
        const numRequests = randomInt(1, MAX_KEY_VALIDATION_REQUESTS_PER_TX);
        times(numRequests, () => kernel.addKeyValidationRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { KEY_VALIDATION: numRequests });
        expect(oracle.getMasterSecretKey).toHaveBeenCalledTimes(numRequests);
      });
    });

    describe('transient data', () => {
      it('resets transient data squashing', async () => {
        const numSquashing = randomInt(1, Math.min(MAX_NULLIFIERS_PER_TX, MAX_NOTE_HASHES_PER_TX));
        const numNoteHashes = randomInt(numSquashing, MAX_NOTE_HASHES_PER_TX);
        const numNullifiers = randomInt(numSquashing, MAX_NULLIFIERS_PER_TX);
        times(numNoteHashes, i => {
          kernel.addNoteHash({ value: new Fr(i + 1), counter: i + 1 });
        });
        times(numNullifiers, i => {
          const noteHashCounter = i + 1;
          const nullifierCounter = i + 1000;
          const noteHash = i < numSquashing ? new Fr(i + 1) : Fr.ZERO;
          kernel.addNullifier({ noteHash, counter: nullifierCounter });
          if (i < numSquashing) {
            noteHashNullifierCounterMap.set(noteHashCounter, nullifierCounter);
          }
        });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { TRANSIENT_DATA_SQUASHING: numSquashing });
      });
    });

    describe('siloing', () => {
      it('resets with note hash siloing', async () => {
        const numNoteHashes = randomInt(1, MAX_NOTE_HASHES_PER_TX);
        times(numNoteHashes, () => kernel.addNoteHash());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);

        expectDimensions(builder, result.dimensions, { NOTE_HASH_SILOING: numNoteHashes });
      });

      it('resets with nullifier siloing', async () => {
        const numNullifiers = randomInt(1, MAX_NULLIFIERS_PER_TX);
        times(numNullifiers, () => kernel.addNullifier());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);

        expectDimensions(builder, result.dimensions, { NULLIFIER_SILOING: numNullifiers });
      });

      it('resets with private log siloing', async () => {
        const numPrivateLogs = randomInt(1, MAX_PRIVATE_LOGS_PER_TX);
        times(numPrivateLogs, () => kernel.addPrivateLog());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);

        expectDimensions(builder, result.dimensions, { PRIVATE_LOG_SILOING: numPrivateLogs });
      });

      it('does not need note hash siloing when already siloed', () => {
        kernel.addNoteHash({ contractAddress: AztecAddress.ZERO });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('does not need nullifier siloing when already siloed', () => {
        kernel.addNullifier({ contractAddress: AztecAddress.ZERO });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('does not need private log siloing when already siloed', () => {
        kernel.addPrivateLog({ contractAddress: AztecAddress.ZERO });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('does not need reset when all side effects are already siloed', () => {
        kernel
          .addNoteHash({ contractAddress: AztecAddress.ZERO })
          .addNullifier({ contractAddress: AztecAddress.ZERO })
          .addPrivateLog({ contractAddress: AztecAddress.ZERO });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('still needs reset for unsiloed dimensions when some are already siloed', async () => {
        // Note hashes already siloed, but nullifiers and logs still need siloing.
        kernel.addNoteHash({ contractAddress: AztecAddress.ZERO }).addNullifier().addPrivateLog();

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, { NULLIFIER_SILOING: 1, PRIVATE_LOG_SILOING: 1 });
      });
    });

    describe('squashes transient data before siloing', () => {
      it('subtracts squashed note hashes and nullifiers from silo counts', async () => {
        kernel
          .addNoteHash({ value: new Fr(11), counter: 1 })
          .addNoteHash({ value: new Fr(22), counter: 2 })
          .addNullifier({ value: new Fr(333), noteHash: new Fr(11), counter: 3 })
          .addNullifier({ value: new Fr(444), counter: 4 });

        noteHashNullifierCounterMap.set(1, 3); // noteHash 11 squashed by nullifier 333

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, {
          NOTE_HASH_SILOING: 1,
          NULLIFIER_SILOING: 1,
        });
      });

      it('subtracts squashed logs from silo count', async () => {
        kernel
          .addNoteHash({ value: new Fr(11), counter: 1 })
          .addNullifier({ value: new Fr(222), noteHash: new Fr(11), counter: 2 })
          .addNoteHash({ value: new Fr(33), counter: 3 })
          // A non-squashed nullifier.
          .addNullifier()
          // A private log linked to the squashed note hash.
          .addPrivateLog({ noteHashCounter: 1 })
          // A private log not linked to any note hash.
          .addPrivateLog({ noteHashCounter: 0 });

        noteHashNullifierCounterMap.set(1, 2);

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, {
          PRIVATE_LOG_SILOING: 1,
          NOTE_HASH_SILOING: 1,
          NULLIFIER_SILOING: 1,
        });
      });
    });
  });

  describe('has next iteration (inner reset)', () => {
    let previousIterations: PrivateCircuitPublicInputsBuilder[];
    let nextIteration: PrivateCircuitPublicInputsBuilder;

    const makeResetBuilder = () => {
      const executionStack = [...previousIterations, ...(nextIteration ? [nextIteration] : [])].map(iteration =>
        makeExecutionResult(iteration.build()),
      );
      return new PrivateKernelResetPrivateInputsBuilder(
        makeKernelOutput(kernel.build()),
        executionStack,
        noteHashNullifierCounterMap,
        splitCounter,
      );
    };

    // For inner reset, only one dimension should be non-zero.
    const expectDimensions = (
      builder: PrivateKernelResetPrivateInputsBuilder,
      actualDimensions: PrivateKernelResetDimensions,
      dimensionName: DimensionName,
      expectedValue: number,
    ) => {
      const requested = builder.getRequestedDimensions();
      // Requested dimension must match exactly.
      expect(requested[dimensionName]).toBe(expectedValue);
      // Actual dimensions (from config) must be at least as large.
      expect(actualDimensions[dimensionName]).toBeGreaterThanOrEqual(expectedValue);
      // All other requested dimensions should be 0. Actual dimensions can be non-zero for other
      // dimensions because the cheapest catalog entry may pad multiple dimensions (e.g. inner_sm).
      for (const name of privateKernelResetDimensionNames) {
        if (name !== dimensionName) {
          expect(requested[name]).toBe(0);
        }
      }
    };

    beforeEach(() => {
      previousIterations = [];
      nextIteration = new PrivateCircuitPublicInputsBuilder();
    });

    it('does not need reset when no data present', async () => {
      const builder = makeResetBuilder();
      expect(builder.needsReset()).toBe(false);

      // Throws if attempting to build.
      await expect(builder.build(oracle)).rejects.toThrow('Reset is not required.');
    });

    describe('note hash read requests', () => {
      it('does not need reset when read requests fit', () => {
        const numReads = randomInt(MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
        times(numReads, () => kernel.addSettledNoteHashReadRequest());

        // The next iteration will add 0 or more reads to keep the total at or below MAX.
        const numNext = randomInt(MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numReads);
        times(numNext, () => nextIteration.addSettledNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('resets when pending reads would overflow', async () => {
        const numReads = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
        times(numReads, i => {
          kernel.addNoteHash({ value: new Fr(i + 1) });
          kernel.addPendingNoteHashReadRequest({ value: new Fr(i + 1) });
        });

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        times(MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numReads + 1, () => nextIteration.addPendingNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', numReads);
      });

      it('resets when settled reads would overflow', async () => {
        const numReads = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
        times(numReads, () => kernel.addSettledNoteHashReadRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        times(MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numReads + 1, () => nextIteration.addSettledNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_SETTLED_READ', numReads);
      });

      it('resets when mixed reads would overflow, pending reads are larger', async () => {
        // Add at least 2 pending reads and 1 settled read.
        const numPending = randomInt(2, MAX_NOTE_HASH_READ_REQUESTS_PER_TX - 1);
        // The number of settled reads is less than the pending reads.
        const numSettled = randomInt(1, Math.min(numPending - 1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numPending));
        times(numPending, i => {
          kernel.addNoteHash({ value: new Fr(i + 1) });
          kernel.addPendingNoteHashReadRequest({ value: new Fr(i + 1) });
        });
        times(numSettled, () => kernel.addSettledNoteHashReadRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        const numNext = MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numPending - numSettled + 1;
        const numNextPending = randomInt(numNext);
        const numNextSettled = numNext - numNextPending;
        times(numNextPending, () => nextIteration.addPendingNoteHashReadRequest());
        times(numNextSettled, () => nextIteration.addSettledNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', numPending);
      });

      it('resets when mixed reads would overflow, settled reads are larger', async () => {
        // Add at least 2 settled reads and 1 pending read.
        const numSettled = randomInt(2, MAX_NOTE_HASH_READ_REQUESTS_PER_TX - 1);
        // The number of pending reads is less than the settled reads.
        const numPending = randomInt(1, Math.min(numSettled - 1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numSettled));
        times(numPending, i => {
          kernel.addNoteHash({ value: new Fr(i + 1) });
          kernel.addPendingNoteHashReadRequest({ value: new Fr(i + 1) });
        });
        times(numSettled, () => kernel.addSettledNoteHashReadRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        const numNext = MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numPending - numSettled + 1;
        const numNextPending = randomInt(numNext);
        const numNextSettled = numNext - numNextPending;
        times(numNextPending, () => nextIteration.addPendingNoteHashReadRequest());
        times(numNextSettled, () => nextIteration.addSettledNoteHashReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_SETTLED_READ', numSettled);
      });

      it('throws when pending reads without matching note hashes would overflow', () => {
        // Pending reads for note hashes that haven't been emitted yet.
        const numUnresolvableReads = randomInt(1, MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
        times(numUnresolvableReads, i => kernel.addPendingNoteHashReadRequest({ value: new Fr(i + 1) }));

        // The next iteration adds enough reads to exceed the maximum allowed by 1.
        times(MAX_NOTE_HASH_READ_REQUESTS_PER_TX - numUnresolvableReads + 1, () =>
          nextIteration.addPendingNoteHashReadRequest(),
        );

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('Number of note hash read requests exceeds the limit.');
      });
    });

    describe('nullifier read requests', () => {
      it('does not need reset when read requests fit', () => {
        const numReads = randomInt(MAX_NULLIFIER_READ_REQUESTS_PER_TX);
        times(numReads, () => kernel.addSettledNullifierReadRequest());

        // The next iteration will add 0 or more reads to keep the total at or below MAX.
        const numNext = randomInt(MAX_NULLIFIER_READ_REQUESTS_PER_TX - numReads);
        times(numNext, () => nextIteration.addSettledNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('resets when pending reads would overflow', async () => {
        const numReads = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX);
        times(numReads, i => {
          kernel.addNullifier({ value: new Fr(i + 1) });
          kernel.addPendingNullifierReadRequest({ value: new Fr(i + 1) });
        });

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        times(MAX_NULLIFIER_READ_REQUESTS_PER_TX - numReads + 1, () => nextIteration.addPendingNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'NULLIFIER_PENDING_READ', numReads);
      });

      it('resets when settled reads would overflow', async () => {
        const numReads = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX);
        times(numReads, () => kernel.addSettledNullifierReadRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        times(MAX_NULLIFIER_READ_REQUESTS_PER_TX - numReads + 1, () => nextIteration.addSettledNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'NULLIFIER_SETTLED_READ', numReads);
      });

      it('resets when mixed reads would overflow, pending reads are larger', async () => {
        // Add at least 2 pending reads and 1 settled read.
        const numPending = randomInt(2, MAX_NULLIFIER_READ_REQUESTS_PER_TX - 1);
        // The number of settled reads is less than the pending reads.
        const numSettled = randomInt(1, Math.min(numPending - 1, MAX_NULLIFIER_READ_REQUESTS_PER_TX - numPending));
        times(numPending, i => {
          kernel.addNullifier({ value: new Fr(i + 1) });
          kernel.addPendingNullifierReadRequest({ value: new Fr(i + 1) });
        });
        times(numSettled, () => kernel.addSettledNullifierReadRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        const numNext = MAX_NULLIFIER_READ_REQUESTS_PER_TX - numPending - numSettled + 1;
        const numNextPending = randomInt(numNext);
        const numNextSettled = numNext - numNextPending;
        times(numNextPending, () => nextIteration.addPendingNullifierReadRequest());
        times(numNextSettled, () => nextIteration.addSettledNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        if (numPending >= numSettled) {
          expectDimensions(builder, result.dimensions, 'NULLIFIER_PENDING_READ', numPending);
        } else {
          expectDimensions(builder, result.dimensions, 'NULLIFIER_SETTLED_READ', numSettled);
        }
      });

      it('resets when mixed reads would overflow, settled reads are larger', async () => {
        // Add at least 2 settled reads and 1 pending read.
        const numSettled = randomInt(2, MAX_NULLIFIER_READ_REQUESTS_PER_TX - 1);
        // The number of pending reads is less than the settled reads.
        const numPending = randomInt(1, Math.min(numSettled - 1, MAX_NULLIFIER_READ_REQUESTS_PER_TX - numSettled));
        times(numPending, i => {
          kernel.addNullifier({ value: new Fr(i + 1) });
          kernel.addPendingNullifierReadRequest({ value: new Fr(i + 1) });
        });
        times(numSettled, () => kernel.addSettledNullifierReadRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        const numNext = MAX_NULLIFIER_READ_REQUESTS_PER_TX - numPending - numSettled + 1;
        const numNextPending = randomInt(numNext);
        const numNextSettled = numNext - numNextPending;
        times(numNextPending, () => nextIteration.addPendingNullifierReadRequest());
        times(numNextSettled, () => nextIteration.addSettledNullifierReadRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        if (numPending >= numSettled) {
          expectDimensions(builder, result.dimensions, 'NULLIFIER_PENDING_READ', numPending);
        } else {
          expectDimensions(builder, result.dimensions, 'NULLIFIER_SETTLED_READ', numSettled);
        }
      });

      it('throws when pending reads without matching nullifiers would overflow', () => {
        // Pending reads for nullifiers that haven't been emitted yet.
        const numUnresolvableReads = randomInt(1, MAX_NULLIFIER_READ_REQUESTS_PER_TX);
        times(numUnresolvableReads, i => kernel.addPendingNullifierReadRequest({ value: new Fr(i + 1) }));

        // The next iteration adds enough reads to exceed the maximum allowed by 1.
        times(MAX_NULLIFIER_READ_REQUESTS_PER_TX - numUnresolvableReads + 1, () =>
          nextIteration.addPendingNullifierReadRequest(),
        );

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('Number of nullifier read requests exceeds the limit.');
      });
    });

    describe('key validation requests', () => {
      it('does not need reset when key validation requests fit', () => {
        const numRequests = randomInt(MAX_KEY_VALIDATION_REQUESTS_PER_TX);
        times(numRequests, () => kernel.addKeyValidationRequest());

        // The next iteration will add 0 or more requests to keep the total at or below MAX.
        const numNext = randomInt(MAX_KEY_VALIDATION_REQUESTS_PER_TX - numRequests);
        times(numNext, () => nextIteration.addKeyValidationRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('resets when key validation requests would overflow', async () => {
        const numRequests = randomInt(1, MAX_KEY_VALIDATION_REQUESTS_PER_TX);
        times(numRequests, () => kernel.addKeyValidationRequest());

        // The next iteration adds enough items to exceed the maximum allowed by 1.
        times(MAX_KEY_VALIDATION_REQUESTS_PER_TX - numRequests + 1, () => nextIteration.addKeyValidationRequest());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'KEY_VALIDATION', numRequests);
      });
    });

    describe('transient data', () => {
      it('does not need reset when note hashes, nullifiers, and private logs will not overflow', () => {
        const numNoteHashes = randomInt(MAX_NOTE_HASHES_PER_TX);
        const numNullifiers = randomInt(MAX_NULLIFIERS_PER_TX);
        const numPrivateLogs = randomInt(MAX_PRIVATE_LOGS_PER_TX);
        const numSquashed = randomInt(Math.min(numNoteHashes, numNullifiers));
        times(numNoteHashes, i => {
          kernel.addNoteHash({ value: new Fr(i + 1) });
        });
        times(numNullifiers, i => {
          const noteHashCounter = i + 1;
          const nullifierCounter = i + 1000;
          const noteHash = i < numSquashed ? new Fr(i + 1) : Fr.ZERO;
          kernel.addNullifier({ noteHash, counter: nullifierCounter });
          if (i < numSquashed) {
            noteHashNullifierCounterMap.set(noteHashCounter, nullifierCounter);
          }
        });
        times(numPrivateLogs, i => {
          const noteHashCounter = i < numSquashed ? i + 1 : 0;
          kernel.addPrivateLog({ noteHashCounter });
        });

        // The next iteration will add 0 or more items to keep the total at or below MAX.
        times(randomInt(MAX_NOTE_HASHES_PER_TX - numNoteHashes), () => nextIteration.addNoteHash());
        times(randomInt(MAX_NULLIFIERS_PER_TX - numNullifiers), () => nextIteration.addNullifier());
        times(randomInt(MAX_PRIVATE_LOGS_PER_TX - numPrivateLogs), () => nextIteration.addPrivateLog());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(false);
      });

      it('resets when note hashes will overflow and transient data can be squashed', async () => {
        const numNoteHashes = randomInt(1, MAX_NOTE_HASHES_PER_TX);
        times(numNoteHashes, i => {
          kernel.addNoteHash({ value: new Fr(i + 1), counter: i + 1 });
        });

        // The next iteration adds enough note hashes to exceed the maximum allowed by 1.
        const numNextNoteHashes = MAX_NOTE_HASHES_PER_TX - numNoteHashes + 1;
        times(numNextNoteHashes, () => nextIteration.addNoteHash());

        // Squash at least 1 note hash to prevent the next iteration from overflowing.
        const numSquashed = randomInt(1, numNoteHashes);

        // Create at least `numSquashed` nullifier to be squashed.
        const numNullifiers = randomInt(numSquashed, MAX_NULLIFIERS_PER_TX);
        times(numNullifiers, i => {
          const noteHashCounter = i + 1;
          const nullifierCounter = i + 1000;
          const noteHash = i < numSquashed ? new Fr(i + 1) : Fr.ZERO;
          kernel.addNullifier({ noteHash, counter: nullifierCounter });
          if (i < numSquashed) {
            noteHashNullifierCounterMap.set(noteHashCounter, nullifierCounter);
          }
        });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'TRANSIENT_DATA_SQUASHING', numSquashed);
      });

      it('resets when nullifiers will overflow and transient data can be squashed', async () => {
        const numNullifiers = randomInt(1, MAX_NULLIFIERS_PER_TX);
        // The next iteration adds enough nullifiers to exceed the maximum allowed by 1.
        const numNextNullifiers = MAX_NULLIFIERS_PER_TX - numNullifiers + 1;
        // Squash at least 1 nullifier to prevent the next iteration from overflowing.
        const numSquashed = randomInt(1, numNullifiers);

        // Create at least `numSquashed` note hash to be squashed.
        const numNoteHashes = randomInt(numSquashed, MAX_NOTE_HASHES_PER_TX);
        times(numNoteHashes, i => {
          kernel.addNoteHash({ value: new Fr(i + 1), counter: i + 1 });
        });

        times(numNullifiers, i => {
          const noteHashCounter = i + 1;
          const nullifierCounter = i + 1000;
          const noteHash = i < numSquashed ? new Fr(i + 1) : Fr.ZERO;
          kernel.addNullifier({ noteHash, counter: nullifierCounter });
          if (i < numSquashed) {
            noteHashNullifierCounterMap.set(noteHashCounter, nullifierCounter);
          }
        });

        times(numNextNullifiers, () => nextIteration.addNullifier());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'TRANSIENT_DATA_SQUASHING', numSquashed);
      });

      it('resets when private logs will overflow and transient data can be squashed', async () => {
        const numLogs = randomInt(1, MAX_PRIVATE_LOGS_PER_TX);
        // The next iteration adds enough logs to exceed the maximum allowed by 1.
        const numNextLogs = MAX_PRIVATE_LOGS_PER_TX - numLogs + 1;
        // Squash at least 1 log to prevent the next iteration from overflowing.
        const numSquashed = randomInt(1, numLogs);
        // Create at least `numSquashed` note hash and nullifier squashable pairs.
        const numNoteHashes = randomInt(numSquashed, MAX_NOTE_HASHES_PER_TX);
        const numNullifiers = randomInt(numSquashed, MAX_NULLIFIERS_PER_TX);

        times(numNoteHashes, i => {
          kernel.addNoteHash({ value: new Fr(i + 1), counter: i + 1 });
        });

        times(numLogs, i => {
          const noteHashCounter = i < numSquashed ? i + 1 : 0;
          kernel.addPrivateLog({ noteHashCounter });
        });

        times(numNullifiers, i => {
          const noteHashCounter = i + 1;
          const nullifierCounter = i + 1000;
          const noteHash = i < numSquashed ? new Fr(i + 1) : Fr.ZERO;
          kernel.addNullifier({ noteHash, counter: nullifierCounter });
          if (i < numSquashed) {
            noteHashNullifierCounterMap.set(noteHashCounter, nullifierCounter);
          }
        });

        times(numNextLogs, () => nextIteration.addPrivateLog());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'TRANSIENT_DATA_SQUASHING', numSquashed);
      });

      it('resets note hash read requests when note hashes overflow by more than squashable transient data', async () => {
        // 2 squashable pairs, but one is blocked by a read request.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);

        kernel.addNoteHash({ value: new Fr(3), counter: 3 });
        kernel.addNullifier({ noteHash: new Fr(3), counter: 4 });
        noteHashNullifierCounterMap.set(3, 4);
        // A pending read request blocks squashing of the second pair.
        kernel.addPendingNoteHashReadRequest({ value: new Fr(3) });

        // Fill remaining note hashes so that the overflow is 2 (but only 1 pair can be squashed).
        times(MAX_NOTE_HASHES_PER_TX - 2, () => kernel.addNoteHash());
        times(2, () => nextIteration.addNoteHash());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Must reset the read request to unblock more squashing in the next round.
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', 1);
      });

      it('resets nullifier read requests when nullifiers overflow by more than squashable transient data', async () => {
        // 2 squashable pairs, but one is blocked by a nullifier read request.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ value: new Fr(99), noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);

        kernel.addNoteHash({ value: new Fr(3), counter: 3 });
        kernel.addNullifier({ value: new Fr(98), noteHash: new Fr(3), counter: 4 });
        noteHashNullifierCounterMap.set(3, 4);
        // A pending read request blocks squashing of the second pair.
        kernel.addPendingNullifierReadRequest({ value: new Fr(98) });

        // Fill remaining nullifiers so that the overflow is 2 (but only 1 pair can be squashed).
        times(MAX_NULLIFIERS_PER_TX - 2, () => kernel.addNullifier());
        times(2, () => nextIteration.addNullifier());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Must reset the read request to unblock more squashing in the next round.
        expectDimensions(builder, result.dimensions, 'NULLIFIER_PENDING_READ', 1);
      });

      it('resets note hash read requests when private logs overflow and squashed logs are insufficient', async () => {
        // 2 squashable pairs with linked logs, but one is blocked by a read request.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);
        kernel.addPrivateLog({ noteHashCounter: 1 });

        kernel.addNoteHash({ value: new Fr(3), counter: 3 });
        kernel.addNullifier({ noteHash: new Fr(3), counter: 4 });
        noteHashNullifierCounterMap.set(3, 4);
        kernel.addPrivateLog({ noteHashCounter: 3 });
        // A pending read request blocks squashing of the second pair.
        kernel.addPendingNoteHashReadRequest({ value: new Fr(3) });

        // Fill remaining private logs so that the overflow is 2 (but only 1 log can be squashed).
        times(MAX_PRIVATE_LOGS_PER_TX - 2, () => kernel.addPrivateLog());
        times(2, () => nextIteration.addPrivateLog());

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Must reset the read request to unblock more squashing in the next round.
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', 1);
      });

      it('resets note hash read requests first when note hashes overflow and transient data is blocked by reads', async () => {
        // A note hash that could be squashed, but is being read.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);
        // A pending read request for the note hash prevents squashing.
        kernel.addPendingNoteHashReadRequest({ value: new Fr(1) });

        // Fill remaining note hashes to cause overflow.
        times(MAX_NOTE_HASHES_PER_TX - 1, () => kernel.addNoteHash());
        nextIteration.addNoteHash();

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Resets the note hash read request instead of transient data.
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', 1);
      });

      it('resets nullifier read requests first when nullifiers overflow and transient data is blocked by reads', async () => {
        // A note hash and nullifier that could be squashed, but the nullifier is being read.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ value: new Fr(99), noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);
        // A pending read request for the nullifier prevents squashing.
        kernel.addPendingNullifierReadRequest({ value: new Fr(99) });

        // Fill remaining nullifiers to cause overflow.
        times(MAX_NULLIFIERS_PER_TX - 1, () => kernel.addNullifier());
        nextIteration.addNullifier();

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Resets the nullifier read request instead of transient data.
        expectDimensions(builder, result.dimensions, 'NULLIFIER_PENDING_READ', 1);
      });

      it('resets note hash read requests first when private logs overflow and transient data is blocked by reads', async () => {
        // A note hash with a linked log that could be squashed, but the note hash is being read.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);
        kernel.addPrivateLog({ noteHashCounter: 1 });
        // A pending read request for the note hash prevents squashing.
        kernel.addPendingNoteHashReadRequest({ value: new Fr(1) });

        // Fill remaining private logs to cause overflow.
        times(MAX_PRIVATE_LOGS_PER_TX - 1, () => kernel.addPrivateLog());
        nextIteration.addPrivateLog();

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Resets the note hash read request instead of transient data.
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', 1);
      });

      it('resets only one dimension when both note hashes and nullifiers overflow', async () => {
        // A squashable pair blocked by a note hash read request.
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ value: new Fr(99), noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);
        kernel.addPendingNoteHashReadRequest({ value: new Fr(1) });
        // A squashable pair blocked by a nullifier read request.
        kernel.addNoteHash({ value: new Fr(3), counter: 3 });
        kernel.addNullifier({ value: new Fr(98), noteHash: new Fr(3), counter: 4 });
        noteHashNullifierCounterMap.set(3, 4);
        kernel.addPendingNullifierReadRequest({ value: new Fr(98) });

        // Fill remaining to cause both note hash and nullifier overflow.
        times(MAX_NOTE_HASHES_PER_TX - 2, () => kernel.addNoteHash());
        times(MAX_NULLIFIERS_PER_TX - 2, () => kernel.addNullifier());
        nextIteration.addNoteHash();
        nextIteration.addNullifier();

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        // Only one dimension should be reset for an inner reset -> note hash read request is reset first.
        expectDimensions(builder, result.dimensions, 'NOTE_HASH_PENDING_READ', 1);
      });

      it('does not squash note hash when a future log in the execution stack is linked to it', () => {
        // A squashable pair: note hash (counter 1) <> nullifier (counter 2).
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);

        // Fill remaining note hashes to cause overflow.
        times(MAX_NOTE_HASHES_PER_TX - 1, () => kernel.addNoteHash());
        nextIteration.addNoteHash();

        // A future log linked to the note hash prevents squashing.
        nextIteration.addPrivateLog({ noteHashCounter: 1 });

        const builder = makeResetBuilder();
        // Without the future log, the pair would be squashed and the overflow resolved.
        // With it, squashing is blocked and the overflow cannot be resolved.
        expect(() => builder.needsReset()).toThrow('Number of note hashes exceeds the limit.');
      });

      it('squashes note hash when future log is linked to a different note hash', async () => {
        // A squashable pair: note hash (counter 1) <> nullifier (counter 2).
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);

        // Fill remaining note hashes to cause overflow.
        times(MAX_NOTE_HASHES_PER_TX - 1, () => kernel.addNoteHash());
        nextIteration.addNoteHash();

        // A future log linked to a different note hash (counter 999) does not block squashing.
        nextIteration.addPrivateLog({ noteHashCounter: 999 });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'TRANSIENT_DATA_SQUASHING', 1);
      });

      it('squashes note hash when future log has noteHashCounter of 0', async () => {
        // A squashable pair: note hash (counter 1) <> nullifier (counter 2).
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);

        // Fill remaining note hashes to cause overflow.
        times(MAX_NOTE_HASHES_PER_TX - 1, () => kernel.addNoteHash());
        nextIteration.addNoteHash();

        // A future log with noteHashCounter = 0 is not linked to any note hash.
        nextIteration.addPrivateLog({ noteHashCounter: 0 });

        const builder = makeResetBuilder();
        expect(builder.needsReset()).toBe(true);

        const result = await builder.build(oracle);
        expectDimensions(builder, result.dimensions, 'TRANSIENT_DATA_SQUASHING', 1);
      });

      it('does not squash note hash when a future log from a previous iteration is linked to it', () => {
        // A squashable pair: note hash (counter 1) <> nullifier (counter 2).
        kernel.addNoteHash({ value: new Fr(1), counter: 1 });
        kernel.addNullifier({ noteHash: new Fr(1), counter: 2 });
        noteHashNullifierCounterMap.set(1, 2);

        // Fill remaining note hashes to cause overflow.
        times(MAX_NOTE_HASHES_PER_TX - 1, () => kernel.addNoteHash());
        nextIteration.addNoteHash();

        // A future log from a previous (unprocessed) iteration linked to the note hash.
        const prevIteration = new PrivateCircuitPublicInputsBuilder();
        prevIteration.addPrivateLog({ noteHashCounter: 1 });
        previousIterations.push(prevIteration);

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('Number of note hashes exceeds the limit.');
      });

      it('throws when note hashes overflow and cannot be squashed', () => {
        for (let i = 0; i < MAX_NOTE_HASHES_PER_TX; i++) {
          kernel.addNoteHash({ value: new Fr(i + 1), counter: (i + 1) * 10 });
        }

        nextIteration.addNoteHash();

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('Number of note hashes exceeds the limit.');
      });

      it('throws when nullifiers overflow and cannot be resolved', () => {
        for (let i = 0; i < MAX_NULLIFIERS_PER_TX; i++) {
          kernel.addNullifier({ value: new Fr(i + 1), counter: (i + 1) * 10 });
        }

        nextIteration.addNullifier();

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('Number of nullifiers exceeds the limit.');
      });

      it('throws when private logs overflow and cannot be resolved', () => {
        for (let i = 0; i < MAX_PRIVATE_LOGS_PER_TX; i++) {
          kernel.addPrivateLog({ counter: (i + 1) * 10 });
        }

        nextIteration.addPrivateLog();

        const builder = makeResetBuilder();
        expect(() => builder.needsReset()).toThrow('Number of private logs exceeds the limit.');
      });
    });

    describe('siloing', () => {
      it('does not check siloing', () => {
        kernel.addNoteHash().addNullifier().addPrivateLog();

        const builder = makeResetBuilder();
        // Nothing overflows, and siloing is not required for inner resets.
        expect(builder.needsReset()).toBe(false);
      });
    });
  });
});
