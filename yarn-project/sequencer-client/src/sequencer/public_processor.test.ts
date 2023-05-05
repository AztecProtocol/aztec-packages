import { PublicExecution, PublicExecutionResult, PublicExecutor } from '@aztec/acir-simulator';
import { CallContext, EthAddress, PUBLIC_DATA_TREE_HEIGHT, TxRequest, makeEmptyProof } from '@aztec/circuits.js';
import { makeKernelPublicInputs } from '@aztec/circuits.js/factories';
import { SiblingPath } from '@aztec/merkle-tree';
import { ContractDataSource, ContractPublicData, EncodedContractFunction } from '@aztec/types';
import { MerkleTreeOperations, TreeInfo } from '@aztec/world-state';
import { jest } from '@jest/globals';
import { MockProxy, mock } from 'jest-mock-extended';
import pick from 'lodash.pick';
import times from 'lodash.times';
import { makePrivateTx, makePublicTx } from '../index.js';
import { Proof, PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { WasmPublicKernelCircuitSimulator } from '../simulator/public_kernel.js';
import { PublicProcessor } from './public_processor.js';

describe('public_processor', () => {
  let db: MockProxy<MerkleTreeOperations>;
  let publicExecutor: MockProxy<PublicExecutor>;
  let publicKernel: MockProxy<PublicKernelCircuitSimulator>;
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
    publicKernel = mock<PublicKernelCircuitSimulator>();
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

    processor = new PublicProcessor(db, publicExecutor, publicKernel, publicProver, contractDataSource);
  });

  it('skips non-public txs', async function () {
    const tx = makePrivateTx();
    const hash = await tx.getTxHash();
    const [processed, failed] = await processor.process([tx]);

    expect(processed).toEqual([{ isEmpty: false, hash, ...pick(tx, 'data', 'proof', 'unverifiedData') }]);
    expect(failed).toEqual([]);
  });

  it('returns failed txs without aborting entire operation', async function () {
    publicExecutor.execute.mockRejectedValue(new Error(`Failed`));

    const tx = makePublicTx();
    const [processed, failed] = await processor.process([tx]);

    expect(processed).toEqual([]);
    expect(failed).toEqual([tx]);
  });

  it('runs a public tx through mock circuits', async function () {
    const tx = makePublicTx();
    const hash = await tx.getTxHash();

    const publicExecutionResult = makePublicExecutionResult(tx.txRequest.txRequest);
    publicExecutor.execute.mockResolvedValue(publicExecutionResult);

    const path = times(PUBLIC_DATA_TREE_HEIGHT, i => Buffer.alloc(32, i));
    db.getSiblingPath.mockResolvedValue(new SiblingPath(path));

    const output = makeKernelPublicInputs();
    publicKernel.publicKernelCircuitNoInput.mockResolvedValue(output);

    const [processed, failed] = await processor.process([tx]);

    expect(processed).toHaveLength(1);
    expect(processed).toEqual([{ isEmpty: false, hash, data: output, proof, ...pick(tx, 'txRequest') }]);
    expect(failed).toEqual([]);

    expect(publicExecutor.execute).toHaveBeenCalled();
    expect(publicKernel.publicKernelCircuitNoInput).toHaveBeenCalled();
  });

  it('runs a public tx through the actual public kernel circuit', async function () {
    const publicKernel = new WasmPublicKernelCircuitSimulator();
    const publicKernelSpy = jest.spyOn(publicKernel, 'publicKernelCircuitNoInput');
    processor = new PublicProcessor(db, publicExecutor, publicKernel, publicProver, contractDataSource);

    const path = times(PUBLIC_DATA_TREE_HEIGHT, i => Buffer.alloc(32, i));
    db.getSiblingPath.mockResolvedValue(new SiblingPath(path));

    const tx = makePublicTx();
    tx.txRequest.txRequest.functionData.isConstructor = false;
    tx.txRequest.txRequest.functionData.isPrivate = false;

    const publicExecutionResult = makePublicExecutionResult(tx.txRequest.txRequest);
    publicExecutor.execute.mockResolvedValue(publicExecutionResult);

    const hash = await tx.getTxHash();
    const [processed, failed] = await processor.process([tx]);

    expect(processed).toHaveLength(1);
    expect(processed).toEqual([
      expect.objectContaining({
        hash,
        proof,
        txRequest: tx.txRequest,
        isEmpty: false,
        data: expect.objectContaining({ isPrivateKernel: false }),
      }),
    ]);
    expect(failed).toEqual([]);

    expect(publicExecutor.execute).toHaveBeenCalled();
    expect(publicKernelSpy).toHaveBeenCalled();
  });
});

function makePublicExecutionResult(tx: TxRequest): PublicExecutionResult {
  const callContext = new CallContext(tx.from, tx.to, EthAddress.ZERO, false, false, false);
  const execution: PublicExecution = {
    callContext,
    contractAddress: tx.to,
    functionData: tx.functionData,
    args: tx.args,
  };
  return {
    execution,
    nestedExecutions: [],
    returnValues: [],
    stateReads: [],
    stateTransitions: [],
  };
}
