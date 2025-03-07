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
  PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
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

import type { WitnessMap } from '@noir-lang/types';

import { PrivateKernelResetPrivateInputsBuilder } from './hints/build_private_kernel_reset_private_inputs.js';
import type { ProvingDataOracle } from './proving_data_oracle.js';

const NULL_PROVE_OUTPUT: PrivateKernelSimulateOutput<PrivateKernelCircuitPublicInputs> = {
  publicInputs: PrivateKernelCircuitPublicInputs.empty(),
  verificationKey: VerificationKeyAsFields.makeEmpty(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  outputWitness: new Map(),
  bytecode: Buffer.from([]),
};

export type ProvingConfig = {
  simulate: boolean;
  skipFeeEnforcement: boolean;
  profile: boolean;
};

/**
 * The KernelProver class is responsible for generating kernel proofs.
 * It takes a transaction request, its signature, and the simulation result as inputs, and outputs a proof
 * along with output notes. The class interacts with a ProvingDataOracle to fetch membership witnesses and
 * constructs private call data based on the execution results.
 */
export class KernelProver {
  private log = createLogger('pxe:kernel-prover');

  constructor(
    private oracle: ProvingDataOracle,
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
   * TODO(#7368) this should be refactored to not recreate the ACIR bytecode now that it operates on a program stack
   */
  async prove(
    txRequest: TxRequest,
    executionResult: PrivateExecutionResult,
    { simulate, skipFeeEnforcement, profile }: ProvingConfig = {
      simulate: false,
      skipFeeEnforcement: false,
      profile: false,
    },
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    const skipProofGeneration = this.fakeProofs || simulate;
    const generateWitnesses = !skipProofGeneration || profile;

    const timer = new Timer();

    const isPrivateOnlyTx = this.isPrivateOnly(executionResult);

    const executionStack = [executionResult.entrypoint];
    let firstIteration = true;

    let output = NULL_PROVE_OUTPUT;

    const gateCounts: { circuitName: string; gateCount: number }[] = [];
    const addGateCount = async (circuitName: string, bytecode: Buffer) => {
      const gateCount = (await this.proofCreator.computeGateCountForCircuit(bytecode, circuitName)) as number;
      gateCounts.push({ circuitName, gateCount });

      this.log.debug(`Gate count for ${circuitName} - ${gateCount}`);
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
          output = generateWitnesses
            ? await this.proofCreator.generateResetOutput(privateInputs)
            : await this.proofCreator.simulateReset(privateInputs);
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
          executionResult.firstNullifier,
        );
        this.log.debug(
          `Calling private kernel init with isPrivateOnly ${isPrivateOnlyTx} and firstNullifierHint ${proofInput.firstNullifierHint}`,
        );

        pushTestData('private-kernel-inputs-init', proofInput);

        output = generateWitnesses
          ? await this.proofCreator.generateInitOutput(proofInput)
          : await this.proofCreator.simulateInit(proofInput);

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

        output = generateWitnesses
          ? await this.proofCreator.generateInnerOutput(proofInput)
          : await this.proofCreator.simulateInner(proofInput);

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
      output = generateWitnesses
        ? await this.proofCreator.generateResetOutput(privateInputs)
        : await this.proofCreator.simulateReset(privateInputs);

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

    acirs.push(tailOutput.bytecode);
    witnessStack.push(tailOutput.outputWitness);
    if (profile) {
      await addGateCount('private_kernel_tail', tailOutput.bytecode);
      tailOutput.profileResult = { gateCounts };
    }

    if (generateWitnesses) {
      this.log.info(`Private kernel witness generation took ${timer.ms()}ms`);
    }

    // TODO(#7368) how do we 'bincode' encode these inputs?
    if (!skipProofGeneration) {
      const ivcProof = await this.proofCreator.createClientIvcProof(acirs, witnessStack);
      tailOutput.clientIvcProof = ivcProof;
    } else {
      tailOutput.clientIvcProof = ClientIvcProof.random();
    }

    return tailOutput;
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
