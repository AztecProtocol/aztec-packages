import { PublicExecution, PublicExecutionResult, PublicExecutor } from '@aztec/acir-simulator';
import {
  ARGS_LENGTH,
  CallContext,
  CircuitsWasm,
  EthAddress,
  Fr,
  FunctionData,
  KERNEL_PRIVATE_CALL_STACK_LENGTH,
  KERNEL_PUBLIC_CALL_STACK_LENGTH,
  PUBLIC_DATA_TREE_HEIGHT,
  Proof,
  PublicCallRequest,
  makeEmptyProof,
  makeTuple,
} from '@aztec/circuits.js';
import { computeCallStackItemHash } from '@aztec/circuits.js/abis';
import {
  makeAztecAddress,
  makeKernelPublicInputs,
  makePublicCallRequest,
  makeSelector,
} from '@aztec/circuits.js/factories';
import { padArrayEnd } from '@aztec/foundation/collection';
import { SiblingPath } from '@aztec/merkle-tree';
import {
  ContractDataSource,
  ContractPublicData,
  EncodedContractFunction,
  FunctionL2Logs,
  Tx,
  TxExecutionRequest,
  TxL2Logs,
} from '@aztec/types';
import { MerkleTreeOperations, TreeInfo } from '@aztec/world-state';
import { MockProxy, mock } from 'jest-mock-extended';
import pick from 'lodash.pick';
import times from 'lodash.times';
import { makeTx } from '../index.js';
import { PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { WasmPublicKernelCircuitSimulator } from '../simulator/public_kernel.js';
import { PublicProcessor } from './public_processor.js';

describe('public_processor', () => {
  let db: MockProxy<MerkleTreeOperations>;
  let publicExecutor: MockProxy<PublicExecutor>;
  let publicProver: MockProxy<PublicProver>;
  let contractDataSource: MockProxy<ContractDataSource>;

  let publicFunction: EncodedContractFunction;
  let contractData: ContractPublicData;
  let proof: Proof;
  let root: Buffer;

  let processor: PublicProcessor;

  beforeEach(() => {
    db = mock<MerkleTreeOperations>();
    publicExecutor = mock<PublicExecutor>();
    publicProver = mock<PublicProver>();
    contractDataSource = mock<ContractDataSource>();

    contractData = ContractPublicData.random();
    publicFunction = EncodedContractFunction.random();
    proof = makeEmptyProof();
    root = Buffer.alloc(32, 5);

    publicProver.getPublicCircuitProof.mockResolvedValue(proof);
    publicProver.getPublicKernelCircuitProof.mockResolvedValue(proof);
    db.getTreeInfo.mockResolvedValue({ root } as TreeInfo);
    contractDataSource.getL2ContractPublicData.mockResolvedValue(contractData);
    contractDataSource.getPublicFunction.mockResolvedValue(publicFunction);
  });

  describe('with mock circuits', () => {
    let publicKernel: MockProxy<PublicKernelCircuitSimulator>;

    beforeEach(() => {
      publicKernel = mock<PublicKernelCircuitSimulator>();
      processor = new PublicProcessor(db, publicExecutor, publicKernel, publicProver, contractDataSource);
    });

    it('skips non-public txs without public execution requests', async function () {
      const tx = makeTx();
      tx.data.end.publicCallStack = makeTuple(KERNEL_PUBLIC_CALL_STACK_LENGTH, Fr.zero);
      const hash = await tx.getTxHash();
      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([{ isEmpty: false, hash, ...pick(tx, 'data', 'proof', 'encryptedLogs') }]);
      expect(failed).toEqual([]);
    });

    it('returns failed txs without aborting entire operation', async function () {
      publicExecutor.execute.mockRejectedValue(new Error(`Failed`));

      const tx = makeTx();
      const [processed, failed] = await processor.process([tx]);

      expect(processed).toEqual([]);
      expect(failed).toEqual([tx]);
    });
  });

  describe('with actual circuits', () => {
    let publicKernel: PublicKernelCircuitSimulator;
    let wasm: CircuitsWasm;

    beforeAll(async () => {
      wasm = await CircuitsWasm.get();
    });

    beforeEach(() => {
      const path = times(PUBLIC_DATA_TREE_HEIGHT, i => Buffer.alloc(32, i));
      db.getSiblingPath.mockResolvedValue(new SiblingPath<number>(PUBLIC_DATA_TREE_HEIGHT, path));
      publicKernel = new WasmPublicKernelCircuitSimulator();
      processor = new PublicProcessor(db, publicExecutor, publicKernel, publicProver, contractDataSource);
    });

    const expectedTxByHash = async (tx: Tx) =>
      expect.objectContaining({
        hash: await tx.getTxHash(),
        proof,
      });

    it('runs a private tx with enqueued calls', async function () {
      const callRequests: PublicCallRequest[] = [makePublicCallRequest(0x100), makePublicCallRequest(0x100)];
      const callStackItems = await Promise.all(callRequests.map(call => call.toPublicCallStackItem()));
      const callStackHashes = callStackItems.map(call => computeCallStackItemHash(wasm, call));

      const kernelOutput = makeKernelPublicInputs(0x10);
      kernelOutput.end.publicCallStack = padArrayEnd(callStackHashes, Fr.ZERO, KERNEL_PUBLIC_CALL_STACK_LENGTH);
      kernelOutput.end.privateCallStack = padArrayEnd([], Fr.ZERO, KERNEL_PRIVATE_CALL_STACK_LENGTH);

      const tx = Tx.createTx(kernelOutput, proof, TxL2Logs.random(2, 3), [], callRequests);

      publicExecutor.execute.mockImplementation(execution => {
        for (const request of callRequests) {
          if (execution.contractAddress.equals(request.contractAddress)) {
            return Promise.resolve(makePublicExecutionResultFromRequest(request));
          }
        }
        throw new Error(`Unexpected execution request: ${execution}`);
      });

      const [processed, failed] = await processor.process([tx]);

      expect(processed).toHaveLength(1);
      expect(processed).toEqual([await expectedTxByHash(tx)]);
      expect(failed).toHaveLength(0);
      expect(publicExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('runs a private tx with an enqueued call with nested execution', async function () {
      const callRequest: PublicCallRequest = makePublicCallRequest(0x100);
      const callStackItem = await callRequest.toPublicCallStackItem();
      const callStackHash = computeCallStackItemHash(wasm, callStackItem);

      const kernelOutput = makeKernelPublicInputs(0x10);
      kernelOutput.end.publicCallStack = padArrayEnd([callStackHash], Fr.ZERO, KERNEL_PUBLIC_CALL_STACK_LENGTH);
      kernelOutput.end.privateCallStack = padArrayEnd([], Fr.ZERO, KERNEL_PRIVATE_CALL_STACK_LENGTH);

      const tx = Tx.createTx(kernelOutput, proof, TxL2Logs.random(2, 3), [], [callRequest]);

      const publicExecutionResult = makePublicExecutionResultFromRequest(callRequest);
      publicExecutionResult.nestedExecutions = [
        makePublicExecutionResult({
          from: publicExecutionResult.execution.contractAddress,
          to: makeAztecAddress(30),
          functionData: new FunctionData(makeSelector(5), false, false),
          args: new Array(ARGS_LENGTH).fill(Fr.ZERO),
        }),
      ];
      publicExecutor.execute.mockResolvedValue(publicExecutionResult);

      const [processed, failed] = await processor.process([tx]);

      expect(processed).toHaveLength(1);
      expect(processed).toEqual([await expectedTxByHash(tx)]);
      expect(failed).toHaveLength(0);
      expect(publicExecutor.execute).toHaveBeenCalledTimes(1);
    });
  });
});

function makePublicExecutionResultFromRequest(item: PublicCallRequest): PublicExecutionResult {
  return {
    execution: item,
    nestedExecutions: [],
    returnValues: [new Fr(1n)],
    newCommitments: [],
    newL2ToL1Messages: [],
    newNullifiers: [],
    contractStorageReads: [],
    contractStorageUpdateRequests: [],
    unencryptedLogs: new FunctionL2Logs([]),
  };
}

function makePublicExecutionResult(
  tx: Pick<TxExecutionRequest, 'from' | 'to' | 'functionData' | 'args'>,
  nestedExecutions: PublicExecutionResult[] = [],
): PublicExecutionResult {
  const callContext = new CallContext(tx.from, tx.to, EthAddress.ZERO, false, false, false);
  const execution: PublicExecution = {
    callContext,
    contractAddress: tx.to,
    functionData: tx.functionData,
    args: tx.args,
  };
  return {
    execution,
    nestedExecutions,
    returnValues: [],
    newCommitments: [],
    newNullifiers: [],
    newL2ToL1Messages: [],
    contractStorageReads: [],
    contractStorageUpdateRequests: [],
    unencryptedLogs: new FunctionL2Logs([]),
  };
}
