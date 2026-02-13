import { BackendType, BarretenbergSync } from '@aztec/bb.js';
import {
  MAX_KEY_VALIDATION_REQUESTS_PER_CALL,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { createLogger } from '@aztec/foundation/log';
import { MembershipWitness } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  ClaimedLengthArray,
  KeyValidationRequest,
  KeyValidationRequestAndGenerator,
  PrivateCircuitPublicInputs,
  PrivateKernelCircuitPublicInputs,
  ReadRequest,
  ScopedKeyValidationRequestAndGenerator,
  ScopedReadRequest,
} from '@aztec/stdlib/kernel';
import { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import { PrivateCallExecutionResult } from '@aztec/stdlib/tx';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { mock } from 'jest-mock-extended';

import type { PrivateKernelOracle } from '../private_kernel_oracle.js';
import { PrivateKernelResetPrivateInputsBuilder } from './private_kernel_reset_private_inputs_builder.js';

describe('PrivateKernelResetPrivateInputsBuilder', () => {
  let oracle: ReturnType<typeof mock<PrivateKernelOracle>>;

  beforeAll(async () => {
    await BarretenbergSync.initSingleton({
      backend: BackendType.NativeSharedMemory,
      logger: createLogger('test').debug,
    });
  });

  beforeEach(() => {
    oracle = mock<PrivateKernelOracle>();
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));
    oracle.getMasterSecretKey.mockResolvedValue(GrumpkinScalar.random());
  });

  function makeKernelOutput(opts: {
    noteHashReadRequests?: ScopedReadRequest[];
    nullifierReadRequests?: ScopedReadRequest[];
    keyValidationRequests?: ScopedKeyValidationRequestAndGenerator[];
  }) {
    const publicInputs = PrivateKernelCircuitPublicInputs.empty();

    if (opts.noteHashReadRequests?.length) {
      publicInputs.validationRequests.noteHashReadRequests = new ClaimedLengthArray(
        padArrayEnd(opts.noteHashReadRequests, ScopedReadRequest.empty(), MAX_NOTE_HASH_READ_REQUESTS_PER_TX),
        opts.noteHashReadRequests.length,
      );
    }

    if (opts.nullifierReadRequests?.length) {
      publicInputs.validationRequests.nullifierReadRequests = new ClaimedLengthArray(
        padArrayEnd(opts.nullifierReadRequests, ScopedReadRequest.empty(), MAX_NULLIFIER_READ_REQUESTS_PER_TX),
        opts.nullifierReadRequests.length,
      );
    }

    if (opts.keyValidationRequests?.length) {
      publicInputs.validationRequests.scopedKeyValidationRequestsAndGenerators = new ClaimedLengthArray(
        padArrayEnd(
          opts.keyValidationRequests,
          ScopedKeyValidationRequestAndGenerator.empty(),
          MAX_KEY_VALIDATION_REQUESTS_PER_TX,
        ),
        opts.keyValidationRequests.length,
      );
    }

    return {
      publicInputs,
      verificationKey: VerificationKeyData.empty(),
      outputWitness: new Map<number, string>(),
      bytecode: Buffer.from([]),
    };
  }

  const makeReadRequest = ({
    value = new Fr(12),
    counter = 100,
    address = AztecAddress.fromBigInt(123n),
  }: { value?: Fr; counter?: number; address?: AztecAddress } = {}) =>
    new ScopedReadRequest(new ReadRequest(value, counter), address);

  /** Creates a minimal execution stack entry whose publicInputs drive the "next iteration" overflow check. */
  function makeNextCallResult(publicInputs: PrivateCircuitPublicInputs): PrivateCallExecutionResult {
    return new PrivateCallExecutionResult(
      Buffer.alloc(0),
      Buffer.alloc(0),
      new Map(),
      publicInputs,
      [],
      new Map(),
      [],
      [],
      [],
      [],
      [],
    );
  }

  describe('note hash read requests', () => {
    beforeEach(() => {
      oracle.getNoteHashMembershipWitness.mockResolvedValue(MembershipWitness.random(NOTE_HASH_TREE_HEIGHT));
    });

    it('deduplicates note hash read requests', async () => {
      // Three identical requests → should dedup to 1.
      const req = makeReadRequest();
      const kernelOutput = makeKernelOutput({
        noteHashReadRequests: [req, req, req],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // Oracle should only be called once for the single unique settled read (not 3 times).
      expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(1);
    });

    it('does not dedup distinct note hash read requests', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });

      const kernelOutput = makeKernelOutput({
        noteHashReadRequests: [req1, req2],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // Both requests are distinct → oracle is called for each.
      expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(2);
    });

    it('deduplicates note hash read requests with a mix of duplicates and unique', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });

      // [req1, req1, req2, req1] → should dedup to [req1, req2] (2 unique).
      const kernelOutput = makeKernelOutput({
        noteHashReadRequests: [req1, req1, req2, req1],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // After dedup, only 2 unique requests → oracle called twice (not 4 times).
      expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(2);
    });

    it('selects a smaller circuit variant when duplicates reduce the count below a threshold', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });
      const req3 = makeReadRequest({ value: new Fr(3) });

      // 7 total requests, but only 3 unique. Without dedup: NOTE_HASH_SETTLED_READ >= 7 → would
      // select dimension 16. With dedup: >= 3 → selects dimension 4.
      const kernelOutput = makeKernelOutput({
        noteHashReadRequests: [req1, req1, req2, req1, req2, req3, req1],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      const inputs = await builder.build(oracle);

      expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(3);
      expect(inputs.dimensions.NOTE_HASH_SETTLED_READ).toBe(4);
    });

    it('triggers reset on overflow even when deduped count is small', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });

      // 55 requests in the kernel (only 2 unique values).
      const requests = Array.from({ length: 55 }, (_, i) => (i % 2 === 0 ? req1 : req2));
      const kernelOutput = makeKernelOutput({ noteHashReadRequests: requests });

      // Next call has 10 read requests → total 65 > MAX (64) → overflow.
      const nextPublicInputs = PrivateCircuitPublicInputs.empty();
      nextPublicInputs.noteHashReadRequests = new ClaimedLengthArray(
        padArrayEnd(
          Array.from({ length: 10 }, () => makeReadRequest({ value: Fr.random() })),
          ScopedReadRequest.empty(),
          MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
        ),
        10,
      );
      const executionStack = [makeNextCallResult(nextPublicInputs)];

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, executionStack, new Map(), 0);

      // Overflow detected using original count (55 + 10 = 65 > 64), even though dedup → only 2 unique.
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // After dedup, only 2 unique settled reads → oracle called twice (not 55 times).
      expect(oracle.getNoteHashMembershipWitness).toHaveBeenCalledTimes(2);
    });
  });

  describe('nullifier read requests', () => {
    beforeEach(() => {
      oracle.getNullifierMembershipWitness.mockResolvedValue(NullifierMembershipWitness.random());
    });

    it('deduplicates nullifier read requests', async () => {
      // Three identical requests → should dedup to 1.
      const req = makeReadRequest();
      const kernelOutput = makeKernelOutput({
        nullifierReadRequests: [req, req, req],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // Oracle should only be called once for the single unique settled read (not 3 times).
      expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(1);
    });

    it('does not dedup distinct nullifier read requests', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });

      const kernelOutput = makeKernelOutput({
        nullifierReadRequests: [req1, req2],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // Both requests are distinct → oracle is called for each.
      expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(2);
    });

    it('deduplicates nullifier read requests with a mix of duplicates and unique', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });

      // [req1, req1, req2, req1] → should dedup to [req1, req2] (2 unique).
      const kernelOutput = makeKernelOutput({
        nullifierReadRequests: [req1, req1, req2, req1],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // After dedup, only 2 unique requests → oracle called twice (not 4 times).
      expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(2);
    });

    it('selects a smaller circuit variant when duplicates reduce the count below a threshold', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });
      const req3 = makeReadRequest({ value: new Fr(3) });

      // 7 total requests, but only 3 unique. Without dedup: NULLIFIER_SETTLED_READ >= 7 → would
      // select dimension 16. With dedup: >= 3 → selects dimension 4.
      const kernelOutput = makeKernelOutput({
        nullifierReadRequests: [req1, req1, req2, req1, req2, req3, req1],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      const inputs = await builder.build(oracle);

      expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(3);
      expect(inputs.dimensions.NULLIFIER_SETTLED_READ).toBe(4);
    });

    it('triggers reset on overflow even when deduped count is small', async () => {
      const req1 = makeReadRequest({ value: new Fr(1) });
      const req2 = makeReadRequest({ value: new Fr(2) });

      // 55 requests in the kernel (only 2 unique values).
      const requests = Array.from({ length: 55 }, (_, i) => (i % 2 === 0 ? req1 : req2));
      const kernelOutput = makeKernelOutput({ nullifierReadRequests: requests });

      // Next call has 10 read requests → total 65 > MAX (64) → overflow.
      const nextPublicInputs = PrivateCircuitPublicInputs.empty();
      nextPublicInputs.nullifierReadRequests = new ClaimedLengthArray(
        padArrayEnd(
          Array.from({ length: 10 }, () => makeReadRequest({ value: Fr.random() })),
          ScopedReadRequest.empty(),
          MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
        ),
        10,
      );
      const executionStack = [makeNextCallResult(nextPublicInputs)];

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, executionStack, new Map(), 0);

      // Overflow detected using original count (55 + 10 = 65 > 64), even though dedup → only 2 unique.
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // After dedup, only 2 unique settled reads → oracle called twice (not 55 times).
      expect(oracle.getNullifierMembershipWitness).toHaveBeenCalledTimes(2);
    });
  });

  describe('key validation requests', () => {
    const makeRequest = ({
      pkM = Point.fromFields([new Fr(12), new Fr(34), Fr.ZERO]),
      skApp = new Fr(56),
      generator = new Fr(78),
      address = AztecAddress.fromBigInt(90n),
    }: { pkM?: Point; skApp?: Fr; generator?: Fr; address?: AztecAddress } = {}) =>
      new ScopedKeyValidationRequestAndGenerator(
        new KeyValidationRequestAndGenerator(new KeyValidationRequest(pkM, skApp), generator),
        address,
      );

    it('deduplicates key validation requests', async () => {
      // Three identical requests → should dedup to 1.
      const req = makeRequest();
      const kernelOutput = makeKernelOutput({
        keyValidationRequests: [req, req, req],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      const inputs = await builder.build(oracle);

      // Oracle should only be called once for the single unique request (not 3 times for the originals).
      expect(oracle.getMasterSecretKey).toHaveBeenCalledTimes(1);

      // The smallest KEY_VALIDATION circuit variant that fits 1 unique request has dimension 4.
      expect(inputs.dimensions.KEY_VALIDATION).toBe(4);
    });

    it('does not dedup distinct key validation requests', async () => {
      const req1 = makeRequest({ skApp: new Fr(1) });
      const req2 = makeRequest({ skApp: new Fr(2) });

      const kernelOutput = makeKernelOutput({
        keyValidationRequests: [req1, req2],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      const inputs = await builder.build(oracle);

      // Both requests are distinct → oracle is called for each.
      expect(oracle.getMasterSecretKey).toHaveBeenCalledTimes(2);

      // The smallest KEY_VALIDATION circuit variant that fits 2 unique requests has dimension 4.
      expect(inputs.dimensions.KEY_VALIDATION).toBe(4);
    });

    it('deduplicates key validation requests with a mix of duplicates and unique', async () => {
      const req1 = makeRequest({ skApp: new Fr(1) });
      const req2 = makeRequest({ skApp: new Fr(2) });

      // [req1, req1, req2, req1] → should dedup to [req1, req2] (2 unique).
      const kernelOutput = makeKernelOutput({
        keyValidationRequests: [req1, req1, req2, req1],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      const inputs = await builder.build(oracle);

      // After dedup, only 2 unique requests → oracle called twice (not 4 times).
      expect(oracle.getMasterSecretKey).toHaveBeenCalledTimes(2);

      // The smallest KEY_VALIDATION circuit variant that fits 2 unique requests has dimension 4.
      expect(inputs.dimensions.KEY_VALIDATION).toBe(4);
    });

    it('selects a smaller circuit variant when duplicates reduce the count below a threshold', async () => {
      // Create 3 unique key validation requests.
      const req1 = makeRequest({ skApp: new Fr(1) });
      const req2 = makeRequest({ skApp: new Fr(2) });
      const req3 = makeRequest({ skApp: new Fr(3) });

      // 7 total requests, but only 3 unique. Without dedup: needs dimension >= 7 → would select
      // the 16-wide variant. With dedup: needs dimension >= 3 → selects the 4-wide variant.
      const kernelOutput = makeKernelOutput({
        keyValidationRequests: [req1, req1, req2, req1, req2, req3, req1],
      });

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, [], new Map(), 0);
      expect(builder.needsReset()).toBe(true);

      const inputs = await builder.build(oracle);

      // After dedup, only 3 unique requests → oracle called 3 times (not 7 times).
      expect(oracle.getMasterSecretKey).toHaveBeenCalledTimes(3);

      // The smallest KEY_VALIDATION circuit variant that fits 3 unique requests has dimension 4.
      // Without dedup, 7 requests would require dimension 16.
      expect(inputs.dimensions.KEY_VALIDATION).toBe(4);
    });

    it('triggers reset on overflow even when deduped count is small', async () => {
      const req1 = makeRequest({ skApp: new Fr(1) });
      const req2 = makeRequest({ skApp: new Fr(2) });

      // 55 requests in the kernel (only 2 unique).
      const requests = Array.from({ length: 55 }, (_, i) => (i % 2 === 0 ? req1 : req2));
      const kernelOutput = makeKernelOutput({ keyValidationRequests: requests });

      // Next call has 10 key validation requests → total 65 > MAX (64) → overflow.
      const nextPublicInputs = PrivateCircuitPublicInputs.empty();
      nextPublicInputs.keyValidationRequestsAndGenerators = new ClaimedLengthArray(
        padArrayEnd(
          Array.from({ length: 10 }, () => makeRequest({ skApp: Fr.random() })),
          ScopedKeyValidationRequestAndGenerator.empty(),
          MAX_KEY_VALIDATION_REQUESTS_PER_CALL,
        ),
        10,
      );
      const executionStack = [makeNextCallResult(nextPublicInputs)];

      const builder = new PrivateKernelResetPrivateInputsBuilder(kernelOutput, executionStack, new Map(), 0);

      // Overflow detected using original count (55 + 10 = 65 > 64), even though dedup → only 2 unique.
      expect(builder.needsReset()).toBe(true);

      await builder.build(oracle);

      // After dedup, only 2 unique requests → oracle called twice (not 55 times).
      expect(oracle.getMasterSecretKey).toHaveBeenCalledTimes(2);
    });
  });
});
