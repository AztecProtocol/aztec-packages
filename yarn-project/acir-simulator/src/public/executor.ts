import {
  AztecAddress,
  CallContext,
  EthAddress,
  Fr,
  FunctionData,
  GlobalVariables,
  PrivateHistoricTreeRoots,
} from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { FunctionL2Logs } from '@aztec/types';
import {
  ZERO_ACVM_FIELD,
  acvm,
  convertACVMFieldToBuffer,
  extractReturnWitness,
  frToAztecAddress,
  frToSelector,
  fromACVMField,
  toACVMField,
  toACVMWitness,
  toAcvmCommitmentLoadOracleInputs,
  toAcvmL1ToL2MessageLoadOracleInputs,
} from '../acvm/index.js';
import { CommitmentsDB, PublicContractsDB, PublicStateDB } from './db.js';
import { PublicExecution, PublicExecutionResult } from './execution.js';
import { ContractStorageActionsCollector } from './state_actions.js';
import { oracleDebugCallToFormattedStr } from '../client/debug.js';
import { PackedArgsCache } from '../packed_args_cache.js';

// Copied from crate::abi at noir-contracts/src/contracts/noir-aztec/src/abi.nr
const NOIR_MAX_RETURN_VALUES = 4;

/**
 * Handles execution of public functions.
 */
export class PublicExecutor {
  private treeRoots: PrivateHistoricTreeRoots;
  constructor(
    private readonly stateDb: PublicStateDB,
    private readonly contractsDb: PublicContractsDB,
    private readonly commitmentsDb: CommitmentsDB,

    private log = createDebugLogger('aztec:simulator:public-executor'),
  ) {
    // Store the tree roots on instantiation.
    this.treeRoots = this.commitmentsDb.getTreeRoots();
  }

  /**
   * Executes a public execution request.
   * @param execution - The execution to run.
   * @param globalVariables - The global variables to use.
   * @returns The result of the run plus all nested runs.
   */
  public async execute(execution: PublicExecution, globalVariables: GlobalVariables): Promise<PublicExecutionResult> {
    const selectorHex = execution.functionData.functionSelectorBuffer.toString('hex');
    this.log(`Executing public external function ${execution.contractAddress.toString()}:${selectorHex}`);

    const selector = execution.functionData.functionSelectorBuffer;
    const acir = await this.contractsDb.getBytecode(execution.contractAddress, selector);
    if (!acir) throw new Error(`Bytecode not found for ${execution.contractAddress.toString()}:${selectorHex}`);

    const initialWitness = getInitialWitness(execution.args, execution.callContext, this.treeRoots, globalVariables);
    const storageActions = new ContractStorageActionsCollector(this.stateDb, execution.contractAddress);
    const newCommitments: Fr[] = [];
    const newL2ToL1Messages: Fr[] = [];
    const newNullifiers: Fr[] = [];
    const nestedExecutions: PublicExecutionResult[] = [];
    const unencryptedLogs = new FunctionL2Logs([]);
    // Functions can request to pack arguments before calling other functions.
    // We use this cache to hold the packed arguments.
    const packedArgs = await PackedArgsCache.create([]);

    const { partialWitness } = await acvm(acir, initialWitness, {
      packArguments: async args => {
        return toACVMField(await packedArgs.pack(args.map(fromACVMField)));
      },

      debugLog: (...args) => {
        this.log(oracleDebugCallToFormattedStr(args));
        return Promise.resolve(ZERO_ACVM_FIELD);
      },
      getL1ToL2Message: async ([msgKey]) => {
        const messageInputs = await this.commitmentsDb.getL1ToL2Message(fromACVMField(msgKey));
        return toAcvmL1ToL2MessageLoadOracleInputs(messageInputs, this.treeRoots.l1ToL2MessagesTreeRoot);
      }, // l1 to l2 messages in public contexts TODO: https://github.com/AztecProtocol/aztec-packages/issues/616
      getCommitment: async ([commitment]) => {
        const commitmentInputs = await this.commitmentsDb.getCommitmentOracle(
          execution.contractAddress,
          fromACVMField(commitment),
        );
        return toAcvmCommitmentLoadOracleInputs(commitmentInputs, this.treeRoots.privateDataTreeRoot);
      },
      storageRead: async ([slot], [numberOfElements]) => {
        const startStorageSlot = fromACVMField(slot);
        const values = [];
        for (let i = 0; i < Number(numberOfElements); i++) {
          const storageSlot = new Fr(startStorageSlot.value + BigInt(i));
          const value = await storageActions.read(storageSlot);
          this.log(`Oracle storage read: slot=${storageSlot.toString()} value=${value.toString()}`);
          values.push(value);
        }
        return values.map(v => toACVMField(v));
      },
      storageWrite: async ([slot], values) => {
        const startStorageSlot = fromACVMField(slot);
        const newValues = [];
        for (let i = 0; i < values.length; i++) {
          const storageSlot = new Fr(startStorageSlot.value + BigInt(i));
          const newValue = fromACVMField(values[i]);
          await storageActions.write(storageSlot, newValue);
          await this.stateDb.storageWrite(execution.contractAddress, storageSlot, newValue);
          this.log(`Oracle storage write: slot=${storageSlot.toString()} value=${newValue.toString()}`);
          newValues.push(newValue);
        }
        return newValues.map(v => toACVMField(v));
      },
      createCommitment: async ([commitment]) => {
        this.log('Creating commitment: ' + commitment.toString());
        newCommitments.push(fromACVMField(commitment));
        return await Promise.resolve(ZERO_ACVM_FIELD);
      },
      createL2ToL1Message: async ([message]) => {
        this.log('Creating L2 to L1 message: ' + message.toString());
        newL2ToL1Messages.push(fromACVMField(message));
        return await Promise.resolve(ZERO_ACVM_FIELD);
      },
      createNullifier: async ([nullifier]) => {
        this.log('Creating nullifier: ' + nullifier.toString());
        newNullifiers.push(fromACVMField(nullifier));
        return await Promise.resolve(ZERO_ACVM_FIELD);
      },
      callPublicFunction: async ([address], [functionSelector], [argsHash]) => {
        const args = packedArgs.unpack(fromACVMField(argsHash));
        this.log(`Public function call: addr=${address} selector=${functionSelector} args=${args.join(',')}`);
        const childExecutionResult = await this.callPublicFunction(
          frToAztecAddress(fromACVMField(address)),
          frToSelector(fromACVMField(functionSelector)),
          args,
          execution.callContext,
          globalVariables,
        );

        nestedExecutions.push(childExecutionResult);
        this.log(`Returning from nested call: ret=${childExecutionResult.returnValues.join(', ')}`);
        return padArrayEnd(childExecutionResult.returnValues, Fr.ZERO, NOIR_MAX_RETURN_VALUES).map(toACVMField);
      },
      emitUnencryptedLog: args => {
        // https://github.com/AztecProtocol/aztec-packages/issues/885
        const log = Buffer.concat(args.map(charBuffer => convertACVMFieldToBuffer(charBuffer).subarray(-1)));
        unencryptedLogs.logs.push(log);
        this.log(`Emitted unencrypted log: "${log.toString('ascii')}"`);
        return Promise.resolve(ZERO_ACVM_FIELD);
      },
    });

    const returnValues = extractReturnWitness(acir, partialWitness).map(fromACVMField);

    const [contractStorageReads, contractStorageUpdateRequests] = storageActions.collect();

    return {
      execution,
      newCommitments,
      newL2ToL1Messages,
      newNullifiers,
      contractStorageReads,
      contractStorageUpdateRequests,
      returnValues,
      nestedExecutions,
      unencryptedLogs,
    };
  }

  private async callPublicFunction(
    targetContractAddress: AztecAddress,
    targetFunctionSelector: Buffer,
    targetArgs: Fr[],
    callerContext: CallContext,
    globalVariables: GlobalVariables,
  ) {
    const portalAddress = (await this.contractsDb.getPortalContractAddress(targetContractAddress)) ?? EthAddress.ZERO;
    const functionData = new FunctionData(targetFunctionSelector, false, false);

    const callContext = CallContext.from({
      msgSender: callerContext.storageContractAddress,
      portalContractAddress: portalAddress,
      storageContractAddress: targetContractAddress,
      isContractDeployment: false,
      isDelegateCall: false,
      isStaticCall: false,
    });

    const nestedExecution: PublicExecution = {
      args: targetArgs,
      contractAddress: targetContractAddress,
      functionData,
      callContext,
    };

    return this.execute(nestedExecution, globalVariables);
  }
}

/**
 * Generates the initial witness for a public function.
 * @param args - The arguments to the function.
 * @param callContext - The call context of the function.
 * @param historicTreeRoots - The historic tree roots.
 * @param globalVariables - The global variables.
 * @param witnessStartIndex - The index where to start inserting the parameters.
 * @returns The initial witness.
 */
function getInitialWitness(
  args: Fr[],
  callContext: CallContext,
  historicTreeRoots: PrivateHistoricTreeRoots,
  globalVariables: GlobalVariables,
  witnessStartIndex = 1,
) {
  return toACVMWitness(witnessStartIndex, [
    callContext.msgSender,
    callContext.storageContractAddress,
    callContext.portalContractAddress,
    callContext.isDelegateCall,
    callContext.isStaticCall,
    callContext.isContractDeployment,

    historicTreeRoots.privateDataTreeRoot,
    historicTreeRoots.nullifierTreeRoot,
    historicTreeRoots.contractTreeRoot,
    historicTreeRoots.l1ToL2MessagesTreeRoot,

    globalVariables.chainId,
    globalVariables.version,
    globalVariables.blockNumber,
    globalVariables.timestamp,

    ...args,
  ]);
}
