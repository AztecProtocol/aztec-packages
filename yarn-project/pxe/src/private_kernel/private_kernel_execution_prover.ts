import { CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS, VK_TREE_HEIGHT } from '@aztec/constants';
import { vkAsFieldsMegaHonk } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { assertLength } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { getProtocolContractLeafAndMembershipWitness, protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeContractAddressFromInstance } from '@aztec/stdlib/contract';
import { hashVK } from '@aztec/stdlib/hash';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import {
  PrivateCallData,
  type PrivateExecutionStep,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  type PrivateKernelExecutionProofOutput,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelSimulateOutput,
  PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateVerificationKeyHints,
} from '@aztec/stdlib/kernel';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  type PrivateCallExecutionResult,
  type PrivateExecutionResult,
  TxRequest,
  collectEnqueuedPublicFunctionCalls,
  collectNoteHashLeafIndexMap,
  collectNoteHashNullifierCounterMap,
  collectPublicTeardownFunctionCall,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/stdlib/tx';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import { PrivateKernelResetPrivateInputsBuilder } from './hints/build_private_kernel_reset_private_inputs.js';
import type { PrivateKernelOracle } from './private_kernel_oracle.js';

const NULL_SIMULATE_OUTPUT: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs> = {
  publicInputs: PrivateKernelCircuitPublicInputs.empty(),
  verificationKey: VerificationKeyAsFields.makeEmpty(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  outputWitness: new Map(),
  bytecode: Buffer.from([]),
};

export interface PrivateKernelExecutionProverConfig {
  simulate: boolean;
  skipFeeEnforcement: boolean;
  profileMode: 'gates' | 'execution-steps' | 'full' | 'none';
}

/**
 * The PrivateKernelSequencer class is responsible for taking a transaction request and sequencing the
 * the execution of the private functions within, sequenced with private kernel "glue" to check protocol rules.
 * The result can be a client IVC proof of the private transaction portion, or just a simulation that can e.g.
 * inform state tree updates.
 */
export class PrivateKernelExecutionProver {
  private log = createLogger('pxe:private-kernel-execution-prover');

  constructor(
    private oracle: PrivateKernelOracle,
    private proofCreator: PrivateKernelProver,
    private fakeProofs = false,
  ) {}

  /**
   * Generate a proof for a given transaction request and execution result.
   * The function iterates through the nested executions in the execution result, creates private call data,
   * and generates a proof using the provided ProofCreator instance. It also maintains an index of new notes
   * created during the execution and returns them as a part of the KernelProverOutput.
   *
   * @param txRequest - The authenticated transaction request object.
   * @param executionResult - The execution result object containing nested executions and preimages.
   * @param profile - Set true to profile the gate count for each circuit
   * @returns A Promise that resolves to a KernelProverOutput object containing proof, public inputs, and output notes.
   */
  async proveWithKernels(
    txRequest: TxRequest,
    executionResult: PrivateExecutionResult,
    { simulate, skipFeeEnforcement, profileMode }: PrivateKernelExecutionProverConfig = {
      simulate: false,
      skipFeeEnforcement: false,
      profileMode: 'none',
    },
  ): Promise<PrivateKernelExecutionProofOutput<PrivateKernelTailCircuitPublicInputs>> {
    const skipProofGeneration = this.fakeProofs || simulate;
    const generateWitnesses = !skipProofGeneration || profileMode !== 'none';

    const timer = new Timer();

    const isPrivateOnlyTx = this.isPrivateOnly(executionResult);

    const executionStack = [executionResult.entrypoint];
    let firstIteration = true;

    let output = NULL_SIMULATE_OUTPUT;

    const executionSteps: PrivateExecutionStep[] = [];

    const noteHashLeafIndexMap = collectNoteHashLeafIndexMap(executionResult);
    const noteHashNullifierCounterMap = collectNoteHashNullifierCounterMap(executionResult);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(executionResult);
    const hasPublicCalls =
      enqueuedPublicFunctions.length > 0 || !collectPublicTeardownFunctionCall(executionResult).isEmpty();
    const validationRequestsSplitCounter = hasPublicCalls ? getFinalMinRevertibleSideEffectCounter(executionResult) : 0;

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
          output = simulate
            ? await this.proofCreator.simulateReset(privateInputs)
            : await this.proofCreator.generateResetOutput(privateInputs);
          executionSteps.push({
            functionName: 'private_kernel_reset',
            bytecode: output.bytecode,
            witness: output.outputWitness,
          });
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

      executionSteps.push({
        functionName: functionName!,
        bytecode: currentExecution.acir,
        witness: currentExecution.partialWitness,
      });

      const privateCallData = await this.createPrivateCallData(currentExecution);

      if (firstIteration) {
        const proofInput = new PrivateKernelInitCircuitPrivateInputs(
          txRequest,
          getVKTreeRoot(),
          protocolContractTreeRoot,
          privateCallData,
          isPrivateOnlyTx,
          executionResult.firstNullifier,
        );
        this.log.debug(
          `Calling private kernel init with isPrivateOnly ${isPrivateOnlyTx} and firstNullifierHint ${proofInput.firstNullifierHint}`,
        );

        pushTestData('private-kernel-inputs-init', proofInput);

        output = generateWitnesses
          ? await this.proofCreator.generateInitOutput(proofInput)
          : await this.proofCreator.simulateInit(proofInput);

        executionSteps.push({
          functionName: 'private_kernel_init',
          bytecode: output.bytecode,
          witness: output.outputWitness,
        });
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

        output = generateWitnesses
          ? await this.proofCreator.generateInnerOutput(proofInput)
          : await this.proofCreator.simulateInner(proofInput);

        executionSteps.push({
          functionName: 'private_kernel_inner',
          bytecode: output.bytecode,
          witness: output.outputWitness,
        });
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
      output = generateWitnesses
        ? await this.proofCreator.generateResetOutput(privateInputs)
        : await this.proofCreator.simulateReset(privateInputs);

      executionSteps.push({
        functionName: 'private_kernel_reset',
        bytecode: output.bytecode,
        witness: output.outputWitness,
      });

      resetBuilder = new PrivateKernelResetPrivateInputsBuilder(
        output,
        [],
        noteHashNullifierCounterMap,
        validationRequestsSplitCounter,
      );
    }

    if (output.publicInputs.feePayer.isZero() && skipFeeEnforcement) {
      if (!skipProofGeneration) {
        throw new Error('Fee payment must be enforced when creating real proof.');
      }
      output.publicInputs.feePayer = new AztecAddress(Fr.MAX_FIELD_VALUE);
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

    const tailOutput = generateWitnesses
      ? await this.proofCreator.generateTailOutput(privateInputs)
      : await this.proofCreator.simulateTail(privateInputs);

    executionSteps.push({
      functionName: 'private_kernel_tail',
      bytecode: tailOutput.bytecode,
      witness: tailOutput.outputWitness,
    });

    if (profileMode == 'gates' || profileMode == 'full') {
      for (const entry of executionSteps) {
        const gateCount = await this.proofCreator.computeGateCountForCircuit(entry.bytecode, entry.functionName);
        entry.gateCount = gateCount;
      }
    }
    if (profileMode === 'gates') {
      for (const entry of executionSteps) {
        // These buffers are often a few megabytes in size - prevent accidentally serializing them if not requested.
        entry.bytecode = Buffer.from([]);
        entry.witness = new Map();
      }
    }

    if (generateWitnesses) {
      this.log.info(`Private kernel witness generation took ${timer.ms()}ms`);
    }

    let clientIvcProof: ClientIvcProof;
    // TODO(#7368) how do we 'bincode' encode these inputs?
    if (!skipProofGeneration) {
      clientIvcProof = await this.proofCreator.createClientIvcProof(executionSteps);
    } else {
      clientIvcProof = ClientIvcProof.random();
    }

    return {
      publicInputs: tailOutput.publicInputs,
      executionSteps,
      clientIvcProof,
      verificationKey: tailOutput.verificationKey,
    };
  }

  private async createPrivateCallData({ publicInputs, vk: vkAsBuffer }: PrivateCallExecutionResult) {
    const { contractAddress, functionSelector } = publicInputs.callContext;

    const vkAsFields = await vkAsFieldsMegaHonk(vkAsBuffer);
    const vk = new VerificationKeyAsFields(vkAsFields, await hashVK(vkAsFields));

    const { currentContractClassId, publicKeys, saltedInitializationHash } =
      await this.oracle.getContractAddressPreimage(contractAddress);
    const functionLeafMembershipWitness = await this.oracle.getFunctionMembershipWitness(
      currentContractClassId,
      functionSelector,
    );

    const { artifactHash: contractClassArtifactHash, publicBytecodeCommitment: contractClassPublicBytecodeCommitment } =
      await this.oracle.getContractClassIdPreimage(currentContractClassId);

    // This will be the address computed in the kernel by the executed class. We need to provide non membership of it in the protocol contract tree.
    // This would only be equal to contractAddress if the currentClassId is equal to the original class id (no update happened).
    const computedAddress = await computeContractAddressFromInstance({
      originalContractClassId: currentContractClassId,
      saltedInitializationHash,
      publicKeys,
    });

    const { lowLeaf: protocolContractLeaf, witness: protocolContractMembershipWitness } =
      await getProtocolContractLeafAndMembershipWitness(contractAddress, computedAddress);

    const updatedClassIdHints = await this.oracle.getUpdatedClassIdHints(contractAddress);
    return PrivateCallData.from({
      publicInputs,
      vk,
      verificationKeyHints: PrivateVerificationKeyHints.from({
        publicKeys,
        contractClassArtifactHash,
        contractClassPublicBytecodeCommitment,
        saltedInitializationHash,
        functionLeafMembershipWitness,
        protocolContractMembershipWitness,
        protocolContractLeaf,
        updatedClassIdHints,
      }),
    });
  }

  private isPrivateOnly(executionResult: PrivateExecutionResult): boolean {
    const isPrivateOnlyRecursive = (callResult: PrivateCallExecutionResult): boolean => {
      const makesPublicCalls =
        callResult.enqueuedPublicFunctionCalls.some(enqueuedCall => !enqueuedCall.isEmpty()) ||
        !callResult.publicTeardownFunctionCall.isEmpty();
      return (
        !makesPublicCalls &&
        callResult.nestedExecutions.every(nestedExecution => isPrivateOnlyRecursive(nestedExecution))
      );
    };
    return isPrivateOnlyRecursive(executionResult.entrypoint);
  }
}
