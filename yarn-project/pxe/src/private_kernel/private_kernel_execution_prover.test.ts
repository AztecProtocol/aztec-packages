import { BackendType, BarretenbergSync } from '@aztec/bb.js';
import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_TX_LIFETIME,
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
import { VerificationKey, VerificationKeyData } from '@aztec/stdlib/vks';

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

  const createExecutionResult = (fnName: string): PrivateExecutionResult => {
    return new PrivateExecutionResult(createCallExecutionResult(fnName), Fr.zero(), []);
  };

  const createCallExecutionResult = (
    fnName: string,
    {
      publicInputs,
      childPublicInputs = [],
    }: {
      publicInputs?: PrivateCircuitPublicInputs;
      childPublicInputs?: PrivateCircuitPublicInputs[];
    } = {},
  ): PrivateCallExecutionResult => {
    if (!publicInputs) {
      publicInputs = PrivateCircuitPublicInputs.empty();
    }
    publicInputs.callContext.functionSelector = new FunctionSelector(fnName.charCodeAt(0));
    publicInputs.callContext.contractAddress = contractAddress;

    return new PrivateCallExecutionResult(
      Buffer.alloc(0),
      VerificationKey.makeFakeMegaHonk(),
      new Map(),
      publicInputs,
      [],
      new Map(),
      [],
      [],
      [],
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
      version: 1 as const,
      salt: Fr.random(),
      deployer: await AztecAddress.random(),
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      initializationHash: Fr.random(),
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
    proofCreator.simulateInner.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateReset.mockResolvedValue(simulateProofOutput());
    proofCreator.simulateTail.mockResolvedValue(simulateProofOutputFinal());

    prover = new PrivateKernelExecutionProver(oracle, proofCreator, true);
  });

  it('should execute private functions in correct order', async () => {
    {
      dependencies = { a: [] };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);

      expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner).not.toHaveBeenCalled();
      proofCreator.simulateInit.mockClear();
    }

    {
      // a {
      //   b {
      //     c {}
      //   }
      //   d {}
      // }
      dependencies = {
        a: ['b', 'd'],
        b: ['c'],
      };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);

      // Init for 'a', inner for 'b', 'c', 'd'.
      expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner).toHaveBeenCalledTimes(3);
      proofCreator.simulateInit.mockClear();
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

      // Init for 'a', inner for the remaining 13 functions.
      expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
      expect(proofCreator.simulateInner).toHaveBeenCalledTimes(13);
    }
  });

  it('executes init, final reset, and tail for a single function', async () => {
    dependencies = { a: [] };
    const executionResult = createExecutionResult('a');
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual(['a', 'private_kernel_init', 'private_kernel_reset', 'private_kernel_tail']);

    expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateInner).not.toHaveBeenCalled();
    expect(proofCreator.simulateReset).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateTail).toHaveBeenCalledTimes(1);
  });

  it('executes init, inners, final reset, and tail for nested functions', async () => {
    // a {
    //   b {
    //     c {}
    //   }
    //   d {}
    // }
    dependencies = { a: ['b', 'd'], b: ['c'] };

    const executionResult = createExecutionResult('a');
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual([
      'a',
      'private_kernel_init',
      'b',
      'private_kernel_inner',
      'c',
      'private_kernel_inner',
      'd',
      'private_kernel_inner',
      'private_kernel_reset',
      'private_kernel_tail',
    ]);
  });

  it('runs inner reset before next iteration when key validation requests overflow', async () => {
    // Set up: init output has MAX key validation requests.
    proofCreator.simulateInit.mockResolvedValue(
      simulateProofOutput(b => times(MAX_KEY_VALIDATION_REQUESTS_PER_TX, () => b.addKeyValidationRequest())),
    );

    // Child function b adds 1 key validation request → total exceeds MAX → inner reset needed.
    const childBuilder = new PrivateCircuitPublicInputsBuilder(contractAddress);
    childBuilder.addKeyValidationRequest();
    const childPublicInputs = childBuilder.build();

    // a { b {} }
    dependencies = { a: ['b'] };

    const entryExecResult = createCallExecutionResult('a', { childPublicInputs: [childPublicInputs] });
    const executionResult = new PrivateExecutionResult(entryExecResult, Fr.zero(), []);
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual([
      'a',
      'private_kernel_init',
      // Inner reset to clear key validation requests before processing b.
      'private_kernel_reset',
      'b',
      'private_kernel_inner',
      // Final reset for siloing.
      'private_kernel_reset',
      'private_kernel_tail',
    ]);

    expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateInner).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateReset).toHaveBeenCalledTimes(2);
    expect(proofCreator.simulateTail).toHaveBeenCalledTimes(1);
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

    expect(proofCreator.simulateTail).toHaveBeenCalledTimes(1);
    const tailInputs = proofCreator.simulateTail.mock.calls[0][0];
    expect(tailInputs.expirationTimestampUpperBound).toBe(blockTimestamp + expectedRoundedOffset);
  });

  it('runs two consecutive inner resets when first reset output still overflows', async () => {
    // Set up: init output has MAX note hash read requests and key validation requests.
    proofCreator.simulateInit.mockResolvedValue(
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

    // Child function b adds 1 note hash read request and 1 key validation request → total exceeds MAX → inner reset triggered.
    const childBuilder = new PrivateCircuitPublicInputsBuilder(contractAddress);
    childBuilder.addPendingNoteHashReadRequest();
    childBuilder.addKeyValidationRequest();
    const childPublicInputs = childBuilder.build();

    // a { b {} }
    dependencies = { a: ['b'] };
    const entryExecResult = createCallExecutionResult('a', { childPublicInputs: [childPublicInputs] });

    const executionResult = new PrivateExecutionResult(entryExecResult, Fr.zero(), []);
    const result = await prove(executionResult);

    const stepNames = result.executionSteps.map(s => s.functionName);
    expect(stepNames).toEqual([
      'a',
      'private_kernel_init',
      // Two consecutive inner resets to clear note hash read requests and key validation requests before processing b.
      'private_kernel_reset',
      'private_kernel_reset',
      'b',
      'private_kernel_inner',
      // Final reset for siloing.
      'private_kernel_reset',
      'private_kernel_tail',
    ]);

    expect(proofCreator.simulateInit).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateInner).toHaveBeenCalledTimes(1);
    expect(proofCreator.simulateReset).toHaveBeenCalledTimes(3);
    expect(proofCreator.simulateTail).toHaveBeenCalledTimes(1);
  });
});
