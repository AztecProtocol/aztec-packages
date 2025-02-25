import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { computeContractAddressFromInstance } from '@aztec/circuits.js/contract';
import { hashVK } from '@aztec/circuits.js/hash';
import {
  type PrivateCallExecutionResult,
  type PrivateExecutionResult,
  type PrivateKernelProver,
  type PrivateKernelSimulateOutput,
  collectEnqueuedPublicFunctionCalls,
  collectNoteHashLeafIndexMap,
  collectNoteHashNullifierCounterMap,
  collectPublicTeardownFunctionCall,
  getFinalMinRevertibleSideEffectCounter,
} from '@aztec/circuits.js/interfaces/client';
import {
  PrivateCallData,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelData,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateVerificationKeyHints,
  type ScopedPrivateLogData,
} from '@aztec/circuits.js/kernel';
import type { PrivateLog } from '@aztec/circuits.js/logs';
import { ClientIvcProof } from '@aztec/circuits.js/proofs';
import type { TxRequest } from '@aztec/circuits.js/tx';
import { VerificationKeyAsFields } from '@aztec/circuits.js/vks';
import { CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS, VK_TREE_HEIGHT } from '@aztec/constants';
import { vkAsFieldsMegaHonk } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { assertLength } from '@aztec/foundation/serialize';
import { pushTestData } from '@aztec/foundation/testing';
import { Timer } from '@aztec/foundation/timer';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { getProtocolContractLeafAndMembershipWitness, protocolContractTreeRoot } from '@aztec/protocol-contracts';

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

export type ProvingConfig = {
  simulate: boolean;
  skipFeeEnforcement: boolean;
  profile: boolean;
  dryRun: boolean;
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
   * @param dryRun - Set true to skip the IVC proof generation (only simulation is run). Useful for profiling gate count without proof gen.
   * @returns A Promise that resolves to a KernelProverOutput object containing proof, public inputs, and output notes.
   * TODO(#7368) this should be refactored to not recreate the ACIR bytecode now that it operates on a program stack
   */
  async prove(
    txRequest: TxRequest,
    executionResult: PrivateExecutionResult,
    { simulate, skipFeeEnforcement, profile, dryRun }: ProvingConfig = {
      simulate: false,
      skipFeeEnforcement: false,
      profile: false,
      dryRun: false,
    },
  ): Promise<PrivateKernelSimulateOutput<PrivateKernelTailCircuitPublicInputs>> {
    if (simulate && profile) {
      throw new Error('Cannot simulate and profile at the same time');
    }

    simulate = simulate || this.fakeProofs;

    const timer = new Timer();

    const isPrivateOnlyTx = this.isPrivateOnly(executionResult);

    const executionStack = [executionResult.entrypoint];
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
          output = simulate
            ? await this.proofCreator.simulateReset(privateInputs)
            : await this.proofCreator.generateResetOutput(privateInputs);
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

        output = simulate
          ? await this.proofCreator.simulateInit(proofInput)
          : await this.proofCreator.generateInitOutput(proofInput);

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

        output = simulate
          ? await this.proofCreator.simulateInner(proofInput)
          : await this.proofCreator.generateInnerOutput(proofInput);

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
      output = simulate
        ? await this.proofCreator.simulateReset(privateInputs)
        : await this.proofCreator.generateResetOutput(privateInputs);

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
      if (!dryRun && !simulate) {
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

    const tailOutput = simulate
      ? await this.proofCreator.simulateTail(privateInputs)
      : await this.proofCreator.generateTailOutput(privateInputs);
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

    if (!simulate) {
      this.log.info(`Private kernel witness generation took ${timer.ms()}ms`);
    }

    // TODO(#7368) how do we 'bincode' encode these inputs?
    if (!dryRun && !simulate) {
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

    // TODO(#262): Use real acir hash
    // const acirHash = keccak256(Buffer.from(bytecode, 'hex'));
    const acirHash = Fr.fromBuffer(Buffer.alloc(32, 0));

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
        acirHash,
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
