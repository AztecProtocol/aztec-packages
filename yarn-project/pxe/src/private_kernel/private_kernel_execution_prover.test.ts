import { BackendType, BarretenbergSync } from '@aztec/bb.js';
import {
  MAX_APPS_PER_KERNEL,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_TX_LIFETIME,
  MEGA_APP_VK_LENGTH_IN_FIELDS,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { MembershipWitness } from '@aztec/foundation/trees';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import { PrivateCircuitPublicInputs, PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { PublicKeys } from '@aztec/stdlib/keys';
import { makeTxRequest } from '@aztec/stdlib/testing';
import { PrivateCallExecutionResult, PrivateExecutionResult, type TxRequest } from '@aztec/stdlib/tx';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { mock } from 'jest-mock-extended';
import times from 'lodash.times';

import {
  PrivateCircuitPublicInputsBuilder,
  PrivateKernelCircuitPublicInputsBuilder,
  makeKernelOutput,
} from './hints/test_utils.js';
import { PrivateKernelExecutionProver } from './private_kernel_execution_prover.js';
import type { PrivateKernelOracle } from './private_kernel_oracle.js';

const logger = createLogger('private_kernel_execution_prover');

describe('Private Kernel Sequencer', () => {
  let txRequest: TxRequest;
  let oracle: ReturnType<typeof mock<PrivateKernelOracle>>;
  let proofCreator: ReturnType<typeof mock<PrivateKernelProver>>;
  let prover: PrivateKernelExecutionProver;
  let dependencies: { [name: string]: string[] } = {};

  const contractAddress = AztecAddress.fromBigInt(987654n);
  const blockTimestamp = 12345n;
  const expirationTimestamp = blockTimestamp + BigInt(MAX_TX_LIFETIME);

  beforeAll(async () => {
    await BarretenbergSync.initSingleton({ backend: BackendType.NativeSharedMemory, logger: logger.debug });
  });

  // Sanity-pin: the multi-app dispatch assertions below assume MAX_APPS_PER_KERNEL is 3. If the
  // protocol constant changes, the per-test expected step shapes (especially the 14-app deep tree
  // case) need to be reworked.
  if (MAX_APPS_PER_KERNEL !== 3) {
    throw new Error(
      `This test suite assumes MAX_APPS_PER_KERNEL === 3, got ${MAX_APPS_PER_KERNEL}. Update the expected dispatch shapes.`,
    );
  }

  const createExecutionResult = (fnName: string): PrivateExecutionResult => {
    return new PrivateExecutionResult(createCallExecutionResult(fnName), Fr.zero(), []);
  };

  const createCallExecutionResult = (
    fnName: string,
    {
      publicInputs,
      childPublicInputs = [],
      address = contractAddress,
      nestedResults,
    }: {
      publicInputs?: PrivateCircuitPublicInputs;
      childPublicInputs?: PrivateCircuitPublicInputs[];
      address?: AztecAddress;
      nestedResults?: PrivateCallExecutionResult[];
    } = {},
  ): PrivateCallExecutionResult => {
    if (!publicInputs) {
      publicInputs = PrivateCircuitPublicInputs.empty();
    }
    publicInputs.callContext.functionSelector = new FunctionSelector(fnName.charCodeAt(0));
    publicInputs.callContext.contractAddress = address;

    return new PrivateCallExecutionResult(
      Buffer.alloc(0),
      Buffer.alloc(MEGA_APP_VK_LENGTH_IN_FIELDS * Fr.SIZE_IN_BYTES),
      new Map(),
      publicInputs,
      [],
      new Map(),
      [],
      [],
      [],
      nestedResults ??
        (dependencies[fnName] || []).map((name, i) =>
          createCallExecutionResult(name, { publicInputs: childPublicInputs[i] }),
        ),
      [],
    );
  };

  /** Creates a mock kernel output. Optionally accepts a callback to configure the builder before building. */
  const simulateProofOutput = (configure?: (builder: PrivateKernelCircuitPublicInputsBuilder) => void) => {
    const builder = new PrivateKernelCircuitPublicInputsBuilder(contractAddress);
    // Every tx has at least one nullifier (the first nullifier), which needs siloing in the final reset.
    builder.addNullifier();
    configure?.(builder);

    const publicInputs = builder.build();
    publicInputs.constants.anchorBlockHeader.globalVariables.timestamp = blockTimestamp;
    publicInputs.expirationTimestamp = expirationTimestamp;

    return makeKernelOutput(publicInputs);
  };

  /** Creates a mock kernel output for the final iteration. Returns empty result as we don't care about it in the tests */
  const simulateProofOutputFinal = () => ({
    publicInputs: PrivateKernelTailCircuitPublicInputs.empty(),
    outputWitness: new Map(),
    verificationKey: VerificationKeyData.empty(),
    bytecode: Buffer.from([]),
  });

  const prove = (executionResult: PrivateExecutionResult) => prover.proveWithKernels(txRequest, executionResult);

  beforeEach(async () => {
    txRequest = makeTxRequest();

    oracle = mock<PrivateKernelOracle>();
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));
    oracle.getMasterSecretKey.mockResolvedValue(Fr.random() as any);

    oracle.getContractAddressPreimage.mockResolvedValue({
      version: 2 as const,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      initializationHash: Fr.random(),
      immutablesHash: Fr.random(),
      publicKeys: await PublicKeys.random(),
      address: await AztecAddress.random(),
      saltedInitializationHash: Fr.random(),
    });
    oracle.getContractClassIdPreimage.mockResolvedValue({
      artifactHash: Fr.random(),
      publicBytecodeCommitment: Fr.random(),
      privateFunctionsRoot: Fr.random(),
    });

    oracle.getDebugFunctionName.mockImplementation((_, selector) =>
      Promise.resolve(String.fromCharCode(selector.value)),
    );

    proofCreator = mock<PrivateKernelProver>();
    proofCreator.simulateInit.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateInit2.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateInit3.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateInner.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateInner2.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateInner3.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateReset.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateResetTail.mockResolvedValue(simulateProofOutputFinal());

    prover = new PrivateKernelExecutionProver(oracle, proofCreator, true);
  });

  it('dispatches the right init_K / inner_K variant at MAX_APPS_PER_KERNEL', async () => {
    {
      // Single app: only one app can be batched, so dispatch is plain init.
      dependencies = { a: [] };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);

      expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInit2).not.toHaveBeenCalled();
      expect(proofCreator.simulateInit3).not.toHaveBeenCalled();
      expect(proofCreator.simulateInner).not.toHaveBeenCalled();
      expect(proofCreator.simulateInner2).not.toHaveBeenCalled();
      expect(proofCreator.simulateInner3).not.toHaveBeenCalled();
      proofCreator.simulateInit.mockClear();
    }

    {
      // a {
      //   b {
      //     c {}
      //   }
      //   d {}
      // }
      // DFS order: a, b, c, d (4 apps). At N=3 the planner picks {a, b, c} as the first batch
      // (init_3), leaving d for a single-app inner.
      dependencies = {
        a: ['b', 'd'],
        b: ['c'],
      };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);

      expect(proofCreator.simulateInit).not.toHaveBeenCalled();
      expect(proofCreator.simulateInit3).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner2).not.toHaveBeenCalled();
      expect(proofCreator.simulateInner3).not.toHaveBeenCalled();
      proofCreator.simulateInit3.mockClear();
      proofCreator.simulateInner.mockClear();
    }

    {
      // a {
      //   b {
      //     d {
      //       h {}
      //     }
      //   }
      //   c {
      //     e {}
      //     f {
      //       i {}
      //       j {
      //         l {
      //           n {}
      //         }
      //         m {}
      //       }
      //       k {}
      //     }
      //     g {}
      //   }
      // DFS order: a, b, d, h, c, e, f, i, j, l, n, m, k, g (14 apps). At N=3 the planner
      // greedily takes 3 per iteration with no overflow under the mock kernel state, giving
      // batches [a,b,d], [h,c,e], [f,i,j], [l,n,m], [k,g] → init_3 + 3×inner_3 + inner_2.
      dependencies = {
        a: ['b', 'c'],
        b: ['d'],
        d: ['h'],
        c: ['e', 'f', 'g'],
        f: ['i', 'j', 'k'],
        j: ['l', 'm'],
        l: ['n'],
      };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);

      expect(proofCreator.simulateInit).not.toHaveBeenCalled();
      expect(proofCreator.simulateInit3).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner).not.toHaveBeenCalled();
      expect(proofCreator.simulateInner2).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner3).toHaveBeenCalledTimes(3);
    }
  });

  it('executes init and terminal reset+tail for a single function', async () => {
    dependencies = { a: [] };
    const executionResult = createExecutionResult('a');
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual(['a', 'private_kernel_init', 'private_kernel_reset_tail']);

    expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateInner).not.toHaveBeenCalled();
    expect(proofCreator.simulateReset).not.toHaveBeenCalled();
    expect(proofCreator.simulateResetTail).toHaveBeenCalledTimes(1);
  });

  it('executes init_3, inner, and terminal reset+tail for nested functions', async () => {
    // a {
    //   b {
    //     c {}
    //   }
    //   d {}
    // }
    // DFS order a, b, c, d. At MAX_APPS_PER_KERNEL=3 the first batch absorbs {a, b, c} into
    // init_3, leaving d for a single-app inner.
    dependencies = { a: ['b', 'd'], b: ['c'] };

    const executionResult = createExecutionResult('a');
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual([
      'a',
      'b',
      'c',
      'private_kernel_init_3',
      'd',
      'private_kernel_inner',
      'private_kernel_reset_tail',
    ]);
  });

  it('runs inner reset before next iteration when key validation requests overflow', async () => {
    // Inner-reset fires between kernel iterations. Use 4 apps so the planner fills init_3 with
    // {a, b, c} and leaves d for a second iteration where the overflow check trips.
    proofCreator.simulateInit3.mockResolvedValue(
      simulateProofOutput(b => times(MAX_KEY_VALIDATION_REQUESTS_PER_TX, () => b.addKeyValidationRequest())),
    );

    // Leftover app d adds 1 key validation request → total exceeds MAX → inner reset needed.
    const dBuilder = new PrivateCircuitPublicInputsBuilder(contractAddress);
    dBuilder.addKeyValidationRequest();
    const dPublicInputs = dBuilder.build();

    // a { b c d } — DFS order a, b, c, d. First batch absorbs {a, b, c}; d is left for the
    // second iteration.
    dependencies = { a: ['b', 'c', 'd'] };

    // Distinct empty PIs for b and c so the createCallExecutionResult helper doesn't mutate a
    // shared callContext across siblings.
    const entryExecResult = createCallExecutionResult('a', {
      childPublicInputs: [PrivateCircuitPublicInputs.empty(), PrivateCircuitPublicInputs.empty(), dPublicInputs],
    });

    const executionResult = new PrivateExecutionResult(entryExecResult, Fr.zero(), []);
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual([
      'a',
      'b',
      'c',
      'private_kernel_init_3',
      // Inner reset to clear key validation requests before processing d.
      'private_kernel_reset',
      'd',
      'private_kernel_inner',
      // Terminal reset+tail performs siloing.
      'private_kernel_reset_tail',
    ]);

    expect(proofCreator.simulateInit3).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateInner).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateReset).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateResetTail).toHaveBeenCalledTimes(1);
  });

  it('rounds the expiration timestamp down before passing it to the tail circuit', async () => {
    // Raw offset 7265s (1h + 1805s) should round down to the 1-hour bucket.
    const rawOffset = 7265n;
    const expectedRoundedOffset = 7200n;

    const customOutput = simulateProofOutput();
    customOutput.publicInputs.expirationTimestamp = blockTimestamp + rawOffset;
    proofCreator.simulateInit.mockResolvedValue(customOutput);
    proofCreator.simulateReset.mockResolvedValue(customOutput);

    dependencies = { a: [] };
    const executionResult = createExecutionResult('a');
    await prove(executionResult);

    expect(proofCreator.simulateResetTail).toHaveBeenCalledTimes(1);
    const tailInputs = proofCreator.simulateResetTail.mock.calls[0][0];
    expect(tailInputs.expirationTimestampUpperBound).toBe(blockTimestamp + expectedRoundedOffset);
  });

  it('runs two consecutive inner resets when first reset output still overflows', async () => {
    // Same 4-app shape as the previous test. Set up init_3 to emit BOTH MAX note hash read
    // requests AND MAX key validation requests so the second iteration trips two distinct
    // overflow predicates back-to-back.
    proofCreator.simulateInit3.mockResolvedValue(
      simulateProofOutput(b => {
        times(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, i => {
          b.addNoteHash({ value: new Fr(i + 1) });
          b.addPendingNoteHashReadRequest({ value: new Fr(i + 1) });
        });
        times(MAX_KEY_VALIDATION_REQUESTS_PER_TX, () => b.addKeyValidationRequest());
      }),
    );

    // First inner reset clears the note hash read requests, but still returns MAX key validation requests → second inner reset needed.
    proofCreator.simulateReset.mockResolvedValueOnce(
      simulateProofOutput(b => times(MAX_KEY_VALIDATION_REQUESTS_PER_TX, () => b.addKeyValidationRequest())),
    );

    // Leftover app d adds 1 note hash read request and 1 key validation request → both
    // dimensions overflow → two inner resets triggered.
    const dBuilder = new PrivateCircuitPublicInputsBuilder(contractAddress);
    dBuilder.addPendingNoteHashReadRequest();
    dBuilder.addKeyValidationRequest();
    const dPublicInputs = dBuilder.build();

    // a { b c d } — DFS order a, b, c, d. First batch absorbs {a, b, c} into init_3; d is left
    // for the second iteration where the dual-overflow forces two resets.
    dependencies = { a: ['b', 'c', 'd'] };
    const entryExecResult = createCallExecutionResult('a', {
      childPublicInputs: [PrivateCircuitPublicInputs.empty(), PrivateCircuitPublicInputs.empty(), dPublicInputs],
    });

    const executionResult = new PrivateExecutionResult(entryExecResult, Fr.zero(), []);
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual([
      'a',
      'b',
      'c',
      'private_kernel_init_3',
      // Two consecutive inner resets to clear note hash read requests and key validation requests before processing d.
      'private_kernel_reset',
      'private_kernel_reset',
      'd',
      'private_kernel_inner',
      // Terminal reset+tail performs siloing.
      'private_kernel_reset_tail',
    ]);

    expect(proofCreator.simulateInit3).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateInner).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateReset).toHaveBeenCalledTimes(2);
    expect(proofCreator.simulateResetTail).toHaveBeenCalledTimes(1);
  });

  it('fetches updated class id hints once per unique contract address', async () => {
    const contractAddressB = AztecAddress.fromBigInt(111111n);

    // a { b {} c {} }
    // a and c use contractAddress, b uses contractAddressB → 2 unique contracts, 3 executions.
    dependencies = {};
    const bExec = createCallExecutionResult('b', { address: contractAddressB });
    const cExec = createCallExecutionResult('c');
    const aExec = createCallExecutionResult('a', { nestedResults: [bExec, cExec] });

    const executionResult = new PrivateExecutionResult(aExec, Fr.zero(), []);
    await prove(executionResult);

    expect(oracle.getUpdatedClassIdHints).toHaveBeenCalledTimes(2);
    expect(oracle.getUpdatedClassIdHints).toHaveBeenCalledWith(contractAddress);
    expect(oracle.getUpdatedClassIdHints).toHaveBeenCalledWith(contractAddressB);
  });
});
