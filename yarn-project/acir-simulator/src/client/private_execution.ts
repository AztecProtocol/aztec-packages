import {
  CallContext,
  CircuitsWasm,
  ContractDeploymentData,
  FunctionData,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  PrivateCallStackItem,
  PublicCallRequest,
} from '@aztec/circuits.js';
import { computeCallStackItemHash } from '@aztec/circuits.js/abis';
import { Curve } from '@aztec/circuits.js/barretenberg';
import { FunctionAbi } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Coordinate, Fr, Point } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { to2Fields } from '@aztec/foundation/serialize';
import { FunctionL2Logs, NotePreimage, NoteSpendingInfo } from '@aztec/types';
import { decodeReturnValues } from '../abi_coder/decoder.js';
import { extractPublicInputs, frToAztecAddress, frToSelector } from '../acvm/deserialize.js';
import {
  ZERO_ACVM_FIELD,
  acvm,
  convertACVMFieldToBuffer,
  fromACVMField,
  toACVMField,
  toACVMWitness,
  toAcvmCallPrivateStackItem,
  toAcvmEnqueuePublicFunctionResult,
} from '../acvm/index.js';
import { ExecutionResult, NewNoteData, NewNullifierData } from '../index.js';
import { ClientTxExecutionContext } from './client_execution_context.js';
import { oracleDebugCallToFormattedStr } from './debug.js';

/**
 * The private function execution class.
 */
export class PrivateFunctionExecution {
  constructor(
    private context: ClientTxExecutionContext,
    private abi: FunctionAbi,
    private contractAddress: AztecAddress,
    private functionData: FunctionData,
    private argsHash: Fr,
    private callContext: CallContext,
    private curve: Curve,

    private log = createDebugLogger('aztec:simulator:secret_execution'),
  ) {}

  /**
   * Executes the function.
   * @returns The execution result.
   */
  public async run(): Promise<ExecutionResult> {
    const selector = this.functionData.functionSelectorBuffer.toString('hex');
    this.log(`Executing external function ${this.contractAddress.toString()}:${selector}`);

    const acir = Buffer.from(this.abi.bytecode, 'hex');
    const initialWitness = this.writeInputs();

    // TODO: Move to ClientTxExecutionContext.
    const newNotePreimages: NewNoteData[] = [];
    const newNullifiers: NewNullifierData[] = [];
    const nestedExecutionContexts: ExecutionResult[] = [];
    const enqueuedPublicFunctionCalls: PublicCallRequest[] = [];
    const encryptedLogs = new FunctionL2Logs([]);
    const unencryptedLogs = new FunctionL2Logs([]);

    const { partialWitness } = await acvm(acir, initialWitness, {
      packArguments: async args => {
        return toACVMField(await this.context.packedArgsCache.pack(args.map(fromACVMField)));
      },
      getSecretKey: async ([ownerX], [ownerY]) =>
        toACVMField(
          await this.context.db.getSecretKey(
            this.contractAddress,
            Point.fromCoordinates(
              Coordinate.fromField(fromACVMField(ownerX)),
              Coordinate.fromField(fromACVMField(ownerY)),
            ),
          ),
        ),
      getPublicKey: async ([acvmAddress]) => {
        const address = frToAztecAddress(fromACVMField(acvmAddress));
        const [pubKey, partialContractAddress] = await this.context.db.getPublicKey(address);
        return [pubKey.x.toBigInt(), pubKey.y.toBigInt(), partialContractAddress].map(toACVMField);
      },
      getNotes: ([slot], sortBy, sortOrder, [limit], [offset], [returnSize]) =>
        this.context.getNotes(this.contractAddress, slot, sortBy, sortOrder, limit, offset, returnSize),
      getRandomField: () => Promise.resolve(toACVMField(Fr.random())),
      notifyCreatedNote: ([storageSlot], acvmPreimage) => {
        newNotePreimages.push({
          storageSlot: fromACVMField(storageSlot),
          preimage: acvmPreimage.map(f => fromACVMField(f)),
        });
        return Promise.resolve(ZERO_ACVM_FIELD);
      },
      notifyNullifiedNote: ([slot], [nullifier], acvmPreimage) => {
        newNullifiers.push({
          preimage: acvmPreimage.map(f => fromACVMField(f)),
          storageSlot: fromACVMField(slot),
          nullifier: fromACVMField(nullifier),
        });
        return Promise.resolve(ZERO_ACVM_FIELD);
      },
      callPrivateFunction: async ([acvmContractAddress], [acvmFunctionSelector], [acvmArgsHash]) => {
        const contractAddress = fromACVMField(acvmContractAddress);
        const functionSelector = fromACVMField(acvmFunctionSelector);
        this.log(
          `Calling private function ${contractAddress.toString()}:${functionSelector} from ${this.callContext.storageContractAddress.toString()}`,
        );

        const childExecutionResult = await this.callPrivateFunction(
          frToAztecAddress(contractAddress),
          frToSelector(functionSelector),
          fromACVMField(acvmArgsHash),
          this.callContext,
          this.curve,
        );

        nestedExecutionContexts.push(childExecutionResult);

        return toAcvmCallPrivateStackItem(childExecutionResult.callStackItem);
      },
      getL1ToL2Message: ([msgKey]) => {
        return this.context.getL1ToL2Message(fromACVMField(msgKey));
      },
      getCommitment: ([commitment]) => this.context.getCommitment(this.contractAddress, commitment),
      debugLog: (...args) => {
        this.log(oracleDebugCallToFormattedStr(args));
        return Promise.resolve(ZERO_ACVM_FIELD);
      },
      enqueuePublicFunctionCall: async ([acvmContractAddress], [acvmFunctionSelector], [acvmArgsHash]) => {
        const enqueuedRequest = await this.enqueuePublicFunctionCall(
          frToAztecAddress(fromACVMField(acvmContractAddress)),
          frToSelector(fromACVMField(acvmFunctionSelector)),
          this.context.packedArgsCache.unpack(fromACVMField(acvmArgsHash)),
          this.callContext,
        );

        this.log(`Enqueued call to public function ${acvmContractAddress}:${acvmFunctionSelector}`);
        enqueuedPublicFunctionCalls.push(enqueuedRequest);
        return toAcvmEnqueuePublicFunctionResult(enqueuedRequest);
      },
      emitUnencryptedLog: message => {
        // https://github.com/AztecProtocol/aztec-packages/issues/885
        const log = Buffer.concat(message.map(charBuffer => convertACVMFieldToBuffer(charBuffer).subarray(-1)));
        unencryptedLogs.logs.push(log);
        this.log(`Emitted unencrypted log: "${log.toString('ascii')}"`);
        return Promise.resolve(ZERO_ACVM_FIELD);
      },
      emitEncryptedLog: ([acvmContractAddress], [acvmStorageSlot], [ownerX], [ownerY], acvmPreimage) => {
        const contractAddress = AztecAddress.fromBuffer(convertACVMFieldToBuffer(acvmContractAddress));
        const storageSlot = fromACVMField(acvmStorageSlot);
        const preimage = acvmPreimage.map(f => fromACVMField(f));

        const notePreimage = new NotePreimage(preimage);
        const noteSpendingInfo = new NoteSpendingInfo(notePreimage, contractAddress, storageSlot);
        const ownerPublicKey = Point.fromCoordinates(
          Coordinate.fromField(fromACVMField(ownerX)),
          Coordinate.fromField(fromACVMField(ownerY)),
        );

        const encryptedNotePreimage = noteSpendingInfo.toEncryptedBuffer(ownerPublicKey, this.curve);

        encryptedLogs.logs.push(encryptedNotePreimage);

        return Promise.resolve(ZERO_ACVM_FIELD);
      },
    });

    const publicInputs = extractPublicInputs(partialWitness, acir);

    const wasm = await CircuitsWasm.get();

    // TODO(#1347): Noir fails with too many unknowns error when public inputs struct contains too many members.
    publicInputs.encryptedLogsHash = to2Fields(encryptedLogs.hash());
    publicInputs.encryptedLogPreimagesLength = new Fr(encryptedLogs.getSerializedLength());
    publicInputs.unencryptedLogsHash = to2Fields(unencryptedLogs.hash());
    publicInputs.unencryptedLogPreimagesLength = new Fr(unencryptedLogs.getSerializedLength());

    const callStackItem = new PrivateCallStackItem(this.contractAddress, this.functionData, publicInputs);
    const returnValues = decodeReturnValues(this.abi, publicInputs.returnValues);

    // TODO(#499): Noir fails to compute the enqueued calls preimages properly, since it cannot use pedersen generators, so we patch those values here.
    const publicCallStackItems = await Promise.all(enqueuedPublicFunctionCalls.map(c => c.toPublicCallStackItem()));
    const publicStack = await Promise.all(publicCallStackItems.map(c => computeCallStackItemHash(wasm, c)));
    callStackItem.publicInputs.publicCallStack = padArrayEnd(
      publicStack,
      Fr.ZERO,
      MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
    );

    // TODO: This should be set manually by the circuit
    publicInputs.contractDeploymentData.deployerPublicKey =
      this.context.txContext.contractDeploymentData.deployerPublicKey;

    this.log(`Returning from call to ${this.contractAddress.toString()}:${selector}`);

    const readRequestCommitmentIndices = this.context.getReadRequestCommitmentIndices();

    return {
      acir,
      partialWitness,
      callStackItem,
      returnValues,
      readRequestCommitmentIndices,
      preimages: {
        newNotes: newNotePreimages,
        nullifiedNotes: newNullifiers,
      },
      vk: Buffer.from(this.abi.verificationKey!, 'hex'),
      nestedExecutions: nestedExecutionContexts,
      enqueuedPublicFunctionCalls,
      encryptedLogs,
      unencryptedLogs,
    };
  }

  // We still need this function until we can get user-defined ordering of structs for fn arguments
  // TODO When that is sorted out on noir side, we can use instead the utilities in serialize.ts
  /**
   * Writes the function inputs to the initial witness.
   * @returns The initial witness.
   */
  private writeInputs() {
    const contractDeploymentData = this.context.txContext.contractDeploymentData ?? ContractDeploymentData.empty();

    const fields = [
      this.callContext.msgSender,
      this.callContext.storageContractAddress,
      this.callContext.portalContractAddress,
      this.callContext.isDelegateCall,
      this.callContext.isStaticCall,
      this.callContext.isContractDeployment,

      this.context.historicRoots.privateDataTreeRoot,
      this.context.historicRoots.nullifierTreeRoot,
      this.context.historicRoots.contractTreeRoot,
      this.context.historicRoots.l1ToL2MessagesTreeRoot,

      contractDeploymentData.constructorVkHash,
      contractDeploymentData.functionTreeRoot,
      contractDeploymentData.contractAddressSalt,
      contractDeploymentData.portalContractAddress,

      this.context.txContext.chainId,
      this.context.txContext.version,

      ...this.context.packedArgsCache.unpack(this.argsHash),
    ];

    return toACVMWitness(1, fields);
  }

  /**
   * Calls a private function as a nested execution.
   * @param targetContractAddress - The address of the contract to call.
   * @param targetFunctionSelector - The function selector of the function to call.
   * @param targetArgsHash - The packed arguments to pass to the function.
   * @param callerContext - The call context of the caller.
   * @param curve - The curve instance to use for elliptic curve operations.
   * @returns The execution result.
   */
  private async callPrivateFunction(
    targetContractAddress: AztecAddress,
    targetFunctionSelector: Buffer,
    targetArgsHash: Fr,
    callerContext: CallContext,
    curve: Curve,
  ) {
    const targetAbi = await this.context.db.getFunctionABI(targetContractAddress, targetFunctionSelector);
    const targetFunctionData = new FunctionData(targetFunctionSelector, true, false);
    const derivedCallContext = await this.deriveCallContext(callerContext, targetContractAddress, false, false);
    const context = this.context.extend();

    const nestedExecution = new PrivateFunctionExecution(
      context,
      targetAbi,
      targetContractAddress,
      targetFunctionData,
      targetArgsHash,
      derivedCallContext,
      curve,
    );

    return nestedExecution.run();
  }

  /**
   * Creates a PublicCallStackItem object representing the request to call a public function. No function
   * is actually called, since that must happen on the sequencer side. All the fields related to the result
   * of the execution are empty.
   * @param targetContractAddress - The address of the contract to call.
   * @param targetFunctionSelector - The function selector of the function to call.
   * @param targetArgs - The arguments to pass to the function.
   * @param callerContext - The call context of the caller.
   * @returns The public call stack item with the request information.
   */
  private async enqueuePublicFunctionCall(
    targetContractAddress: AztecAddress,
    targetFunctionSelector: Buffer,
    targetArgs: Fr[],
    callerContext: CallContext,
  ): Promise<PublicCallRequest> {
    const derivedCallContext = await this.deriveCallContext(callerContext, targetContractAddress, false, false);
    return PublicCallRequest.from({
      args: targetArgs,
      callContext: derivedCallContext,
      functionData: new FunctionData(targetFunctionSelector, false, false),
      contractAddress: targetContractAddress,
    });
  }

  /**
   * Derives the call context for a nested execution.
   * @param parentContext - The parent call context.
   * @param targetContractAddress - The address of the contract being called.
   * @param isDelegateCall - Whether the call is a delegate call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The derived call context.
   */
  private async deriveCallContext(
    parentContext: CallContext,
    targetContractAddress: AztecAddress,
    isDelegateCall = false,
    isStaticCall = false,
  ) {
    const portalContractAddress = await this.context.db.getPortalContractAddress(targetContractAddress);
    return new CallContext(
      parentContext.storageContractAddress,
      targetContractAddress,
      portalContractAddress,
      isDelegateCall,
      isStaticCall,
      false,
    );
  }
}
