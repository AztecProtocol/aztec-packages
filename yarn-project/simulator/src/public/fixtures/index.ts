import { MerkleTreeId, PublicExecutionRequest, Tx } from '@aztec/circuit-types';
import {
  type AvmCircuitInputs,
  BlockHeader,
  CallContext,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  DEFAULT_GAS_LIMIT,
  DEPLOYER_CONTRACT_ADDRESS,
  FunctionSelector,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  type PublicFunction,
  PublicKeys,
  RollupValidationRequests,
  SerializableContractInstance,
  TxConstantData,
  TxContext,
  computePublicBytecodeCommitment,
} from '@aztec/circuits.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { type ContractArtifact, type FunctionArtifact } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js';
import { PublicTxSimulator, WorldStateDB } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { strict as assert } from 'assert';

export async function simulateAvmTestContractGenerateCircuitInputs(
  functionName: string,
  calldata: Fr[] = [],
  expectRevert: boolean = false,
  assertionErrString?: string,
): Promise<AvmCircuitInputs> {
  const sender = AztecAddress.random();
  const functionSelector = getAvmTestContractFunctionSelector(functionName);
  calldata = [functionSelector.toField(), ...calldata];

  const globalVariables = GlobalVariables.empty();
  globalVariables.gasFees = GasFees.empty();
  globalVariables.timestamp = new Fr(99833);

  const telemetry = new NoopTelemetryClient();
  const merkleTrees = await (await MerkleTrees.new(openTmpStore(), telemetry)).fork();
  const contractDataSource = new MockedAvmTestContractDataSource();
  const worldStateDB = new WorldStateDB(merkleTrees, contractDataSource);

  const contractInstance = contractDataSource.contractInstance;
  const contractAddressNullifier = siloNullifier(
    AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
    contractInstance.address.toField(),
  );
  await merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()], 0);
  // other contract address used by the bulk test's GETCONTRACTINSTANCE test
  const otherContractAddressNullifier = siloNullifier(
    AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
    contractDataSource.otherContractInstance.address.toField(),
  );
  await merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [otherContractAddressNullifier.toBuffer()], 0);

  const simulator = new PublicTxSimulator(
    merkleTrees,
    worldStateDB,
    new NoopTelemetryClient(),
    globalVariables,
    /*doMerkleOperations=*/ true,
  );

  const callContext = new CallContext(
    sender,
    contractInstance.address,
    contractDataSource.fnSelector,
    /*isStaticCall=*/ false,
  );
  const executionRequest = new PublicExecutionRequest(callContext, calldata);

  const tx: Tx = createTxForPublicCall(executionRequest);

  const avmResult = await simulator.simulate(tx);

  if (!expectRevert) {
    expect(avmResult.revertCode.isOK()).toBe(true);
  } else {
    // Explicit revert when an assertion failed.
    expect(avmResult.revertCode.isOK()).toBe(false);
    expect(avmResult.revertReason).toBeDefined();
    if (assertionErrString !== undefined) {
      expect(avmResult.revertReason?.getMessage()).toContain(assertionErrString);
    }
  }

  const avmCircuitInputs: AvmCircuitInputs = avmResult.avmProvingRequest.inputs;
  return avmCircuitInputs;
}

/**
 * Craft a carrier transaction for a public call for simulation by PublicTxSimulator.
 */
export function createTxForPublicCall(
  executionRequest: PublicExecutionRequest,
  gasUsedByPrivate: Gas = Gas.empty(),
  isTeardown: boolean = false,
): Tx {
  const callRequest = executionRequest.toCallRequest();
  // use max limits
  const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

  const forPublic = PartialPrivateTailPublicInputsForPublic.empty();
  // TODO(#9269): Remove this fake nullifier method as we move away from 1st nullifier as hash.
  forPublic.nonRevertibleAccumulatedData.nullifiers[0] = Fr.random(); // fake tx nullifier
  if (isTeardown) {
    forPublic.publicTeardownCallRequest = callRequest;
  } else {
    forPublic.revertibleAccumulatedData.publicCallRequests[0] = callRequest;
  }

  const teardownGasLimits = isTeardown ? gasLimits : Gas.empty();
  const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());
  const txContext = new TxContext(Fr.zero(), Fr.zero(), gasSettings);
  const constantData = new TxConstantData(BlockHeader.empty(), txContext, Fr.zero(), Fr.zero());

  const txData = new PrivateKernelTailCircuitPublicInputs(
    constantData,
    RollupValidationRequests.empty(),
    /*gasUsed=*/ gasUsedByPrivate,
    AztecAddress.zero(),
    forPublic,
  );
  const tx = isTeardown ? Tx.newWithTxData(txData, executionRequest) : Tx.newWithTxData(txData);
  if (!isTeardown) {
    tx.enqueuedPublicFunctionCalls[0] = executionRequest;
  }

  return tx;
}

export class MockedAvmTestContractDataSource {
  private fnName = 'public_dispatch';
  private bytecode: Buffer;
  public fnSelector: FunctionSelector;
  private publicFn: PublicFunction;
  private contractClass: ContractClassPublic;
  public contractInstance: ContractInstanceWithAddress;
  private bytecodeCommitment: Fr;
  public otherContractInstance: ContractInstanceWithAddress;

  constructor() {
    this.bytecode = getAvmTestContractBytecode(this.fnName);
    this.fnSelector = getAvmTestContractFunctionSelector(this.fnName);
    this.publicFn = { bytecode: this.bytecode, selector: this.fnSelector };
    this.contractClass = makeContractClassPublic(0, this.publicFn);
    this.contractInstance = makeContractInstanceFromClassId(this.contractClass.id);
    this.bytecodeCommitment = computePublicBytecodeCommitment(this.bytecode);
    // The values here should match those in `avm_simulator.test.ts`
    // Used for GETCONTRACTINSTANCE test
    this.otherContractInstance = new SerializableContractInstance({
      version: 1,
      salt: new Fr(0x123),
      deployer: new AztecAddress(new Fr(0x456)),
      contractClassId: new Fr(0x789),
      initializationHash: new Fr(0x101112),
      publicKeys: new PublicKeys(
        new Point(new Fr(0x131415), new Fr(0x161718), false),
        new Point(new Fr(0x192021), new Fr(0x222324), false),
        new Point(new Fr(0x252627), new Fr(0x282930), false),
        new Point(new Fr(0x313233), new Fr(0x343536), false),
      ),
    }).withAddress(AztecAddress.fromNumber(0x4444));
  }

  getPublicFunction(_address: AztecAddress, _selector: FunctionSelector): Promise<PublicFunction> {
    return Promise.resolve(this.publicFn);
  }

  getBlockNumber(): Promise<number> {
    throw new Error('Method not implemented.');
  }

  getContractClass(_id: Fr): Promise<ContractClassPublic> {
    return Promise.resolve(this.contractClass);
  }

  getBytecodeCommitment(_id: Fr): Promise<Fr> {
    return Promise.resolve(this.bytecodeCommitment);
  }

  addContractClass(_contractClass: ContractClassPublic): Promise<void> {
    return Promise.resolve();
  }

  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress> {
    if (address.equals(this.contractInstance.address)) {
      return Promise.resolve(this.contractInstance);
    } else {
      return Promise.resolve(this.otherContractInstance);
    }
  }

  getContractClassIds(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }

  getContractArtifact(_address: AztecAddress): Promise<ContractArtifact | undefined> {
    throw new Error('Method not implemented.');
  }

  getContractFunctionName(_address: AztecAddress, _selector: FunctionSelector): Promise<string> {
    return Promise.resolve(this.fnName);
  }

  addContractArtifact(_address: AztecAddress, _contract: ContractArtifact): Promise<void> {
    return Promise.resolve();
  }
}

function getAvmTestContractFunctionSelector(functionName: string): FunctionSelector {
  const artifact = AvmTestContractArtifact.functions.find(f => f.name === functionName)!;
  assert(!!artifact, `Function ${functionName} not found in AvmTestContractArtifact`);
  const params = artifact.parameters;
  return FunctionSelector.fromNameAndParameters(artifact.name, params);
}

function getAvmTestContractArtifact(functionName: string): FunctionArtifact {
  const artifact = AvmTestContractArtifact.functions.find(f => f.name === functionName)!;
  assert(
    !!artifact?.bytecode,
    `No bytecode found for function ${functionName}. Try re-running bootstrap.sh on the repository root.`,
  );
  return artifact;
}

function getAvmTestContractBytecode(functionName: string): Buffer {
  const artifact = getAvmTestContractArtifact(functionName);
  return artifact.bytecode;
}
