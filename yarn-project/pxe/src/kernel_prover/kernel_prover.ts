import {
  type PrivateExecutionResult,
  type PrivateKernelProver,
  type PrivateKernelSimulateOutput,
  collectEnqueuedPublicFunctionCalls,
  collectNoteHashLeafIndexMap,
  collectNoteHashNullifierCounterMap,
  collectPublicTeardownFunctionCall,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/circuit-types';
import {
  CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  Fr,
  PROTOCOL_CONTRACT_TREE_HEIGHT,
  PrivateCallData,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  type PrivateLog,
  type ScopedPrivateLogData,
  type TxRequest,
  VK_TREE_HEIGHT,
  VerificationKeyAsFields,
} from '@aztec/circuits.js';
import { hashVK } from '@aztec/circuits.js/hash';
import { makeTuple } from '@aztec/foundation/array';
import { vkAsFieldsMegaHonk } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { assertLength } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing/files';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/client';
import {
  getProtocolContractSiblingPath,
  isProtocolContract,
  protocolContractTreeRoot,
} from '@aztec/protocol-contracts';

import { type WitnessMap } from '@noir-lang/types';
import { strict as assert } from 'assert';

import { PrivateKernelResetPrivateInputsBuilder } from './hints/build_private_kernel_reset_private_inputs.js';
import { type ProvingDataOracle } from './proving_data_oracle.js';

// TODO(#10592): Temporary workaround to check that the private logs are correctly split into non-revertible set and revertible set.
// This should be done in TailToPublicOutputValidator in private kernel tail.
function checkPrivateLogs(
  privateLogs: ScopedPrivateLogData[],
  nonRevertiblePrivateLogs: PrivateLog[],
  revertiblePrivateLogs: PrivateLog[],
  splitCounter: number,
) {
  let numNonRevertible = 0;
  let numRevertible = 0;
  privateLogs
    .filter(privateLog => privateLog.inner.counter !== 0)
    .forEach(privateLog => {
      if (privateLog.inner.counter < splitCounter) {
        assert(
          privateLog.inner.log.toBuffer().equals(nonRevertiblePrivateLogs[numNonRevertible].toBuffer()),
          `mismatch non-revertible private logs at index ${numNonRevertible}`,
        );
        numNonRevertible++;
      } else {
        assert(
          privateLog.inner.log.toBuffer().equals(revertiblePrivateLogs[numRevertible].toBuffer()),
          `mismatch revertible private logs at index ${numRevertible}`,
        );
        numRevertible++;
      }
    });
  assert(
    nonRevertiblePrivateLogs.slice(numNonRevertible).every(l => l.isEmpty()),
    'Unexpected non-empty private log in non-revertible set.',
  );
  assert(
    revertiblePrivateLogs.slice(numRevertible).every(l => l.isEmpty()),
    'Unexpected non-empty private log in revertible set.',
  );
}

const NULL_PROVE_OUTPUT: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs> = {
  publicInputs: PrivateKernelCircuitPublicInputs.empty(),
  verificationKey: VerificationKeyAsFields.makeEmpty(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  outputWitness: new Map(),
  bytecode: Buffer.from([]),
};

/**
 * The KernelProver class is responsible for generating kernel proofs.
 * It takes a transaction request, its signature, and the simulation result as inputs, and outputs a proof
 * along with output notes. The class interacts with a ProvingDataOracle to fetch membership witnesses and
 * constructs private call data based on the execution results.
 */
export class KernelProver {
  private log = createLogger('pxe:kernel-prover');

  constructor(private oracle: ProvingDataOracle, private proofCreator: PrivateKernelProver) {}

  /**
   * Generate a proof for a given transaction request and execution result.
   * The function iterates through the nested executions in the execution result, creates private call data,
   * and generates a proof using the provided ProofCreator instance. It also maintains an index of new notes
   * created during the execution and returns them as a part of the KernelProverOutput.
   *
   * @param txRequest - The authenticated transaction request object.
   * @param executionResult - The execution result object containing nested executions and preimages.
   * @param profile - Set true to profile the gate count for each circuit
   * @param dryRun - Set true to skip the IVC proof generation (only simulation is run). Useful for profiling gate count without proof gen.
   * @returns A Promise that resolves to a KernelProverOutput object containing proof, public inputs, and output notes.
   * TODO(#7368) this should be refactored to not recreate the ACIR bytecode now that it operates on a program stack
   */
  async prove(
    txRequest: TxRequest,
    executionResult: PrivateExecutionResult,
    profile: boolean = false,
    dryRun: boolean = false,
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    const timer = new Timer();

    const isPrivateOnlyTx = this.isPrivateOnly(executionResult);

    const executionStack = [executionResult];
    let firstIteration = true;

    let output = NULL_PROVE_OUTPUT;

    const gateCounts: { circuitName: string; gateCount: number }[] = [];
    const addGateCount = async (circuitName: string, bytecode: Buffer) => {
      const gateCount = (await this.proofCreator.computeGateCountForCircuit(bytecode, circuitName)) as number;
      gateCounts.push({ circuitName, gateCount });

      this.log.info(`Tx ${txRequest.hash()}: bb gates for ${circuitName} - ${gateCount}`);
    };

    const noteHashLeafIndexMap = collectNoteHashLeafIndexMap(executionResult);
    const noteHashNullifierCounterMap = collectNoteHashNullifierCounterMap(executionResult);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(executionResult);
    const hasPublicCalls =
      enqueuedPublicFunctions.length > 0 || !collectPublicTeardownFunctionCall(executionResult).isEmpty();
    const validationRequestsSplitCounter = hasPublicCalls ? getFinalMinRevertibleSideEffectCounter(executionResult) : 0;
    // vector of gzipped bincode acirs
    const acirs: Buffer[] = [];
    const witnessStack: WitnessMap[] = [];

    while (executionStack.length) {
      if (!firstIteration) {
        let resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
          output,
          executionStack,
          noteHashNullifierCounterMap,
          validationRequestsSplitCounter,
        );
        while (resetBuilder.needsReset()) {
          const privateInputs = await resetBuilder.build(this.oracle, noteHashLeafIndexMap);
          output = await this.proofCreator.simulateProofReset(privateInputs);
          // TODO(#7368) consider refactoring this redundant bytecode pushing
          acirs.push(output.bytecode);
          witnessStack.push(output.outputWitness);
          if (profile) {
            await addGateCount('private_kernel_reset', output.bytecode);
          }

          resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
            output,
            executionStack,
            noteHashNullifierCounterMap,
            validationRequestsSplitCounter,
          );
        }
      }

      const currentExecution = executionStack.pop()!;

      executionStack.push(...[...currentExecution.nestedExecutions].reverse());

      const functionName = await this.oracle.getDebugFunctionName(
        currentExecution.publicInputs.callContext.contractAddress,
        currentExecution.publicInputs.callContext.functionSelector,
      );

      // TODO(#7368): This used to be associated with getDebugFunctionName
      // TODO(#7368): Is there any way to use this with client IVC proving?
      acirs.push(currentExecution.acir);
      witnessStack.push(currentExecution.partialWitness);
      if (profile) {
        await addGateCount(functionName as string, currentExecution.acir);
      }

      const privateCallData = await this.createPrivateCallData(currentExecution);

      if (firstIteration) {
        const proofInput = new PrivateKernelInitCircuitPrivateInputs(
          txRequest,
          getVKTreeRoot(),
          protocolContractTreeRoot,
          privateCallData,
          isPrivateOnlyTx,
        );
        pushTestData('private-kernel-inputs-init', proofInput);
        output = await this.proofCreator.simulateProofInit(proofInput);

        acirs.push(output.bytecode);
        witnessStack.push(output.outputWitness);
        if (profile) {
          await addGateCount('private_kernel_init', output.bytecode);
        }
      } else {
        const previousVkMembershipWitness = await this.oracle.getVkMembershipWitness(output.verificationKey);
        const previousKernelData = new PrivateKernelData(
          output.publicInputs,
          output.verificationKey,
          Number(previousVkMembershipWitness.leafIndex),
          assertLength<Fr, typeof VK_TREE_HEIGHT>(previousVkMembershipWitness.siblingPath, VK_TREE_HEIGHT),
        );
        const proofInput = new PrivateKernelInnerCircuitPrivateInputs(previousKernelData, privateCallData);
        pushTestData('private-kernel-inputs-inner', proofInput);
        output = await this.proofCreator.simulateProofInner(proofInput);

        acirs.push(output.bytecode);
        witnessStack.push(output.outputWitness);
        if (profile) {
          await addGateCount('private_kernel_inner', output.bytecode);
        }
      }
      firstIteration = false;
    }

    // Reset.
    let resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
      output,
      [],
      noteHashNullifierCounterMap,
      validationRequestsSplitCounter,
    );
    while (resetBuilder.needsReset()) {
      const privateInputs = await resetBuilder.build(this.oracle, noteHashLeafIndexMap);
      output = await this.proofCreator.simulateProofReset(privateInputs);

      acirs.push(output.bytecode);
      witnessStack.push(output.outputWitness);
      if (profile) {
        await addGateCount('private_kernel_reset', output.bytecode);
      }

      resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
        output,
        [],
        noteHashNullifierCounterMap,
        validationRequestsSplitCounter,
      );
    }

    // Private tail.
    const previousVkMembershipWitness = await this.oracle.getVkMembershipWitness(output.verificationKey);
    const previousKernelData = new PrivateKernelData(
      output.publicInputs,
      output.verificationKey,
      Number(previousVkMembershipWitness.leafIndex),
      assertLength<Fr, typeof VK_TREE_HEIGHT>(previousVkMembershipWitness.siblingPath, VK_TREE_HEIGHT),
    );

    this.log.debug(
      `Calling private kernel tail with hwm ${previousKernelData.publicInputs.minRevertibleSideEffectCounter}`,
    );

    const privateInputs = new PrivateKernelTailCircuitPrivateInputs(previousKernelData);

    pushTestData('private-kernel-inputs-ordering', privateInputs);
    const tailOutput = await this.proofCreator.simulateProofTail(privateInputs);
    if (tailOutput.publicInputs.forPublic) {
      const privateLogs = privateInputs.previousKernel.publicInputs.end.privateLogs;
      const nonRevertiblePrivateLogs = tailOutput.publicInputs.forPublic.nonRevertibleAccumulatedData.privateLogs;
      const revertiblePrivateLogs = tailOutput.publicInputs.forPublic.revertibleAccumulatedData.privateLogs;
      checkPrivateLogs(privateLogs, nonRevertiblePrivateLogs, revertiblePrivateLogs, validationRequestsSplitCounter);
    }

    acirs.push(tailOutput.bytecode);
    witnessStack.push(tailOutput.outputWitness);
    if (profile) {
      await addGateCount('private_kernel_tail', tailOutput.bytecode);
      tailOutput.profileResult = { gateCounts };
    }

    this.log.info(`Witness generation took ${timer.ms()}ms`);

    // TODO(#7368) how do we 'bincode' encode these inputs?
    if (!dryRun) {
      const ivcProof = await this.proofCreator.createClientIvcProof(acirs, witnessStack);
      tailOutput.clientIvcProof = ivcProof;
    }

    return tailOutput;
  }

  private async createPrivateCallData({ publicInputs, vk: vkAsBuffer }: PrivateExecutionResult) {
    const { contractAddress, functionSelector } = publicInputs.callContext;

    const vkAsFields = vkAsFieldsMegaHonk(vkAsBuffer);
    const vk = new VerificationKeyAsFields(vkAsFields, hashVK(vkAsFields));

    const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
      contractAddress,
      functionSelector,
    );
    const { contractClassId, publicKeys, saltedInitializationHash } = await this.oracle.getContractAddressPreimage(
      contractAddress,
    );
    const { artifactHash: contractClassArtifactHash, publicBytecodeCommitment: contractClassPublicBytecodeCommitment } =
      await this.oracle.getContractClassIdPreimage(contractClassId);

    // TODO(#262): Use real acir hash
    // const acirHash = keccak256(Buffer.from(bytecode, 'hex'));
    const acirHash = Fr.fromBuffer(Buffer.alloc(32, 0));

    const protocolContractSiblingPath = isProtocolContract(contractAddress)
      ? getProtocolContractSiblingPath(contractAddress)
      : makeTuple(PROTOCOL_CONTRACT_TREE_HEIGHT, Fr.zero);

    return PrivateCallData.from({
      publicInputs,
      vk,
      publicKeys,
      contractClassArtifactHash,
      contractClassPublicBytecodeCommitment,
      saltedInitializationHash,
      functionLeafMembershipWitness,
      protocolContractSiblingPath,
      acirHash,
    });
  }

  private isPrivateOnly(executionResult: PrivateExecutionResult): boolean {
    const makesPublicCalls =
      executionResult.enqueuedPublicFunctionCalls.some(enqueuedCall => !enqueuedCall.isEmpty()) ||
      !executionResult.publicTeardownFunctionCall.isEmpty();
    return (
      !makesPublicCalls &&
      executionResult.nestedExecutions.every(nestedExecution => this.isPrivateOnly(nestedExecution))
    );
  }
}
