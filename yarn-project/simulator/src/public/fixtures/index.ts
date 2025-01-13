import { MerkleTreeId, type MerkleTreeWriteOperations, PublicExecutionRequest, Tx } from '@aztec/circuit-types';
import {
  type AvmCircuitInputs,
  BlockHeader,
  CallContext,
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  DEFAULT_GAS_LIMIT,
  DEPLOYER_CONTRACT_ADDRESS,
  FunctionSelector,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
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
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { strict as assert } from 'assert';

import { initContext, initExecutionEnvironment, initPersistableStateManager } from '../../avm/fixtures/index.js';
import { AvmEphemeralForest, AvmSimulator } from '../../server.js';
import { PublicEnqueuedCallSideEffectTrace } from '../enqueued_call_side_effect_trace.js';
import { WorldStateDB } from '../public_db_sources.js';
import { PublicTxSimulator } from '../public_tx_simulator.js';

const TIMESTAMP = new Fr(99833);

export async function simulateAvmTestContractGenerateCircuitInputs(
  functionName: string,
  args: Fr[] = [],
  expectRevert: boolean = false,
  contractDataSource = new MockedAvmTestContractDataSource(),
  assertionErrString?: string,
): Promise<AvmCircuitInputs> {
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;

  const merkleTrees = await (await MerkleTrees.new(openTmpStore(), new NoopTelemetryClient())).fork();
  await contractDataSource.deployContracts(merkleTrees);
  const worldStateDB = new WorldStateDB(merkleTrees, contractDataSource);

  const simulator = new PublicTxSimulator(
    merkleTrees,
    worldStateDB,
    new NoopTelemetryClient(),
    globals,
    /*doMerkleOperations=*/ true,
  );

  const sender = AztecAddress.random();
  const functionSelector = getAvmTestContractFunctionSelector(functionName);
  args = [functionSelector.toField(), ...args];
  const callContext = new CallContext(
    sender,
    contractDataSource.firstContractInstance.address,
    contractDataSource.fnSelector,
    /*isStaticCall=*/ false,
  );
  const executionRequest = new PublicExecutionRequest(callContext, args);

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

export async function simulateAvmTestContractCall(
  functionName: string,
  args: Fr[] = [],
  expectRevert: boolean = false,
  contractDataSource = new MockedAvmTestContractDataSource(),
) {
  const globals = GlobalVariables.empty();
  globals.timestamp = TIMESTAMP;

  const merkleTrees = await (await MerkleTrees.new(openTmpStore(), new NoopTelemetryClient())).fork();
  await contractDataSource.deployContracts(merkleTrees);
  const worldStateDB = new WorldStateDB(merkleTrees, contractDataSource);

  const trace = new PublicEnqueuedCallSideEffectTrace();
  const ephemeralTrees = await AvmEphemeralForest.create(worldStateDB.getMerkleInterface());
  const persistableState = initPersistableStateManager({
    worldStateDB,
    trace,
    merkleTrees: ephemeralTrees,
    doMerkleOperations: true,
  });

  const sender = AztecAddress.random();
  const functionSelector = getAvmTestContractFunctionSelector(functionName);
  args = [functionSelector.toField(), ...args];
  const environment = initExecutionEnvironment({
    calldata: args,
    globals,
    address: contractDataSource.firstContractInstance.address,
    sender,
  });
  const context = initContext({ env: environment, persistableState });

  // First we simulate (though it's not needed in this simple case).
  const simulator = new AvmSimulator(context);
  const results = await simulator.execute();

  expect(results.reverted).toBe(expectRevert);
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

export class MockedAvmTestContractDataSource implements ContractDataSource {
  private fnName = 'public_dispatch';
  public fnSelector: FunctionSelector = getAvmTestContractFunctionSelector(this.fnName);
  private bytecode: Buffer;
  private publicFn: PublicFunction;
  private bytecodeCommitment: Fr;

  // maps contract class ID to class
  private contractClasses: Map<string, ContractClassPublic> = new Map();
  // maps contract instance address to instance
  public contractInstances: Map<string, ContractInstanceWithAddress> = new Map();

  public firstContractInstance: ContractInstanceWithAddress = SerializableContractInstance.default().withAddress(
    AztecAddress.fromNumber(0),
  );
  public instanceSameClassAsFirstContract: ContractInstanceWithAddress =
    SerializableContractInstance.default().withAddress(AztecAddress.fromNumber(0));
  public otherContractInstance: ContractInstanceWithAddress;

  constructor(private skipContractDeployments: boolean = false) {
    this.bytecode = getAvmTestContractBytecode(this.fnName);
    this.fnSelector = getAvmTestContractFunctionSelector(this.fnName);
    this.publicFn = { bytecode: this.bytecode, selector: this.fnSelector };
    this.bytecodeCommitment = computePublicBytecodeCommitment(this.bytecode);

    // create enough unique classes to hit the limit (plus two extra)
    for (let i = 0; i < MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + 1; i++) {
      const contractClass = makeContractClassPublic(/*seed=*/ i, this.publicFn);
      const contractInstance = makeContractInstanceFromClassId(contractClass.id, /*seed=*/ i);
      this.contractClasses.set(contractClass.id.toString(), contractClass);
      this.contractInstances.set(contractInstance.address.toString(), contractInstance);
      if (i === 0) {
        this.firstContractInstance = contractInstance;
      }
    }
    // a contract with the same class but different instance/address as the first contract
    this.instanceSameClassAsFirstContract = makeContractInstanceFromClassId(
      this.firstContractInstance.contractClassId,
      /*seed=*/ 1000,
    );

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

  async deployContracts(merkleTrees: MerkleTreeWriteOperations) {
    if (!this.skipContractDeployments) {
      for (const contractInstance of this.contractInstances.values()) {
        const contractAddressNullifier = siloNullifier(
          AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
          contractInstance.address.toField(),
        );
        await merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()], 0);
      }

      const instanceSameClassAsFirstContractNullifier = siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        this.instanceSameClassAsFirstContract.address.toField(),
      );
      await merkleTrees.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        [instanceSameClassAsFirstContractNullifier.toBuffer()],
        0,
      );

      // other contract address used by the bulk test's GETCONTRACTINSTANCE test
      const otherContractAddressNullifier = siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        this.otherContractInstance.address.toField(),
      );
      await merkleTrees.batchInsert(MerkleTreeId.NULLIFIER_TREE, [otherContractAddressNullifier.toBuffer()], 0);
    }
  }

  public static async create(
    merkleTrees: MerkleTreeWriteOperations,
    skipContractDeployments: boolean = false,
  ): Promise<MockedAvmTestContractDataSource> {
    const dataSource = new MockedAvmTestContractDataSource(skipContractDeployments);
    if (!skipContractDeployments) {
      await dataSource.deployContracts(merkleTrees);
    }
    return dataSource;
  }

  getPublicFunction(_address: AztecAddress, _selector: FunctionSelector): Promise<PublicFunction> {
    return Promise.resolve(this.publicFn);
  }

  getBlockNumber(): Promise<number> {
    throw new Error('Method not implemented.');
  }

  getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return Promise.resolve(this.contractClasses.get(id.toString()));
  }

  getBytecodeCommitment(_id: Fr): Promise<Fr> {
    return Promise.resolve(this.bytecodeCommitment);
  }

  addContractClass(_contractClass: ContractClassPublic): Promise<void> {
    return Promise.resolve();
  }

  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    if (!this.skipContractDeployments) {
      if (address.equals(this.otherContractInstance.address)) {
        return Promise.resolve(this.otherContractInstance);
      } else if (address.equals(this.instanceSameClassAsFirstContract.address)) {
        return Promise.resolve(this.instanceSameClassAsFirstContract);
      } else {
        return Promise.resolve(this.contractInstances.get(address.toString()));
      }
    }
    return Promise.resolve(undefined);
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

  registerContractFunctionSignatures(_address: AztecAddress, _signatures: string[]): Promise<void> {
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
