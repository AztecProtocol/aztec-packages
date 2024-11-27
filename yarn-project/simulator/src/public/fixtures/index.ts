import { PublicExecutionRequest, Tx } from '@aztec/circuit-types';
import {
  type AvmCircuitInputs,
  CallContext,
  DEFAULT_GAS_LIMIT,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  Header,
  MAX_L2_GAS_PER_ENQUEUED_CALL,
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
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/utils';
import { PublicTxSimulator, type WorldStateDB } from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees } from '@aztec/world-state';

import { mock } from 'jest-mock-extended';

import { getAvmTestContractBytecode, getAvmTestContractFunctionSelector } from '../../avm/fixtures/index.js';

const TIMESTAMP = new Fr(99833);

/**
 * If assertionErrString is set, we expect a (non exceptional halting) revert due to a failing assertion and
 * we check that the revert reason error contains this string. However, the circuit must correctly prove the
 * execution.
 */
export async function simulateAvmTestContractGenerateCircuitInputs(
  functionName: string,
  calldata: Fr[] = [],
  assertionErrString?: string,
): Promise<AvmCircuitInputs> {
  const sender = AztecAddress.random();
  const functionSelector = getAvmTestContractFunctionSelector(functionName);
  calldata = [functionSelector.toField(), ...calldata];

  const globalVariables = GlobalVariables.empty();
  globalVariables.gasFees = GasFees.empty();
  globalVariables.timestamp = TIMESTAMP;

  const worldStateDB = mock<WorldStateDB>();
  const telemetry = new NoopTelemetryClient();
  const merkleTrees = await (await MerkleTrees.new(openTmpStore(), telemetry)).fork();
  worldStateDB.getMerkleInterface.mockReturnValue(merkleTrees);

  // Top level contract call
  const bytecode = getAvmTestContractBytecode('public_dispatch');
  const dispatchSelector = getAvmTestContractFunctionSelector('public_dispatch');
  const publicFn: PublicFunction = { bytecode, selector: dispatchSelector };
  const contractClass = makeContractClassPublic(0, publicFn);
  const contractInstance = makeContractInstanceFromClassId(contractClass.id);

  // The values here should match those in `avm_simulator.test.ts`
  const instanceGet = new SerializableContractInstance({
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
  }).withAddress(contractInstance.address);
  worldStateDB.getContractInstance
    .mockResolvedValueOnce(contractInstance)
    .mockResolvedValueOnce(instanceGet) // test gets deployer
    .mockResolvedValueOnce(instanceGet) // test gets class id
    .mockResolvedValueOnce(instanceGet) // test gets init hash
    .mockResolvedValue(contractInstance);
  worldStateDB.getContractClass.mockResolvedValue(contractClass);
  worldStateDB.getBytecode.mockResolvedValue(bytecode);
  worldStateDB.getBytecodeCommitment.mockResolvedValue(computePublicBytecodeCommitment(bytecode));

  const storageValue = new Fr(5);
  worldStateDB.storageRead.mockResolvedValue(Promise.resolve(storageValue));

  const simulator = new PublicTxSimulator(
    merkleTrees,
    worldStateDB,
    new NoopTelemetryClient(),
    globalVariables,
    /*realAvmProving=*/ true,
    /*doMerkleOperations=*/ true,
  );

  const callContext = new CallContext(sender, contractInstance.address, dispatchSelector, /*isStaticCall=*/ false);
  const executionRequest = new PublicExecutionRequest(callContext, calldata);

  const tx: Tx = createTxForPublicCall(executionRequest);

  const avmResult = await simulator.simulate(tx);

  if (assertionErrString == undefined) {
    expect(avmResult.revertCode.isOK()).toBe(true);
  } else {
    // Explicit revert when an assertion failed.
    expect(avmResult.revertCode.isOK()).toBe(false);
    expect(avmResult.revertReason).toBeDefined();
    expect(avmResult.revertReason?.getMessage()).toContain(assertionErrString);
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
  const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_ENQUEUED_CALL);

  const forPublic = PartialPrivateTailPublicInputsForPublic.empty();
  // TODO(#9269): Remove this fake nullifier method as we move away from 1st nullifier as hash.
  forPublic.nonRevertibleAccumulatedData.nullifiers[0] = Fr.random(); // fake tx nullifier
  if (isTeardown) {
    forPublic.publicTeardownCallRequest = callRequest;
  } else {
    forPublic.revertibleAccumulatedData.publicCallRequests[0] = callRequest;
  }

  const teardownGasLimits = isTeardown ? gasLimits : Gas.empty();
  const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty());
  const txContext = new TxContext(Fr.zero(), Fr.zero(), gasSettings);
  const constantData = new TxConstantData(Header.empty(), txContext, Fr.zero(), Fr.zero());

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
