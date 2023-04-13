import { ExecutionResult } from '@aztec/acir-simulator';
import {
  AztecAddress,
  EcdsaSignature,
  MembershipWitness,
  PRIVATE_CALL_STACK_LENGTH,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  TxRequest,
  VK_TREE_HEIGHT,
  VerificationKey,
} from '@aztec/circuits.js';
import { makeTxRequest } from '@aztec/circuits.js/factories';
import { mock } from 'jest-mock-extended';
import { KernelProver } from './kernel_prover.js';
import { ProofCreator } from './proof_creator.js';
import { ProvingDataOracle } from './proving_data_oracle.js';

describe('Kernel Prover', () => {
  let txRequest: TxRequest;
  let txSignature: EcdsaSignature;
  let oracle: ReturnType<typeof mock<ProvingDataOracle>>;
  let proofCreator: ReturnType<typeof mock<ProofCreator>>;
  let prover: KernelProver;
  let dependencies: { [name: string]: string[] } = {};

  const vk = VerificationKey.makeFake().toBuffer();
  const createExecutionResult = (entry: string): ExecutionResult =>
    ({
      callStackItem: new PrivateCallStackItem(AztecAddress.ZERO, entry as any, PrivateCircuitPublicInputs.empty()),
      nestedExecutions: (dependencies[entry] || []).map(name => createExecutionResult(name)),
      vk,
    } as ExecutionResult);

  const expectExecution = (fns: string[]) => {
    const callStackItems = proofCreator.createProof.mock.calls.map(args => args[2].callStackItem.functionData);
    expect(callStackItems).toEqual(fns);
    proofCreator.createProof.mockClear();
  };

  const prove = (executionResult: ExecutionResult) => prover.prove(txRequest, txSignature, executionResult);

  beforeEach(() => {
    txRequest = makeTxRequest();
    txSignature = EcdsaSignature.random();

    oracle = mock<ProvingDataOracle>();
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));

    proofCreator = mock<ProofCreator>();
    proofCreator.createProof.mockResolvedValue({} as any);

    prover = new KernelProver(oracle, proofCreator);
  });

  it('should create proofs in correct order', async () => {
    {
      dependencies = { a: [] };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);
      expectExecution(['a']);
    }

    {
      dependencies = {
        a: ['b', 'd'],
        b: ['c'],
      };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);
      expectExecution(['a', 'd', 'b', 'c']);
    }

    {
      dependencies = {
        k: ['m', 'o'],
        m: ['q'],
        o: ['n', 'p', 'r'],
      };
      const executionResult = createExecutionResult('k');
      await prove(executionResult);
      expectExecution(['k', 'o', 'r', 'p', 'n', 'm', 'q']);
    }
  });

  it('should throw if call stack is too deep', async () => {
    dependencies.a = Array(PRIVATE_CALL_STACK_LENGTH + 1)
      .fill(0)
      .map((_, i) => `${i}`);
    const executionResult = createExecutionResult('a');
    await expect(prove(executionResult)).rejects.toThrow();
  });
});
