import { AztecAddress, CallContext, EthAddress, Fr, FunctionData, PrivateHistoricTreeRoots } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { TxExecutionRequest } from '@aztec/types';
import { select_return_flattened as selectPublicWitnessFlattened } from '@noir-lang/noir_util_wasm';
import { ACVMField, ZERO_ACVM_FIELD, acvm, frToAztecAddress, frToSelector, fromACVMField, toACVMField, toACVMWitness } from '../acvm/index.js';
import { PublicExecution, PublicExecutionResult } from './execution.js';
import { ContractStorageActionsCollector } from './state_actions.js';
import { PublicExecutionContext } from '../execution_context.js';

// Copied from crate::abi at noir-contracts/src/contracts/noir-aztec3/src/abi.nr
const NOIR_MAX_RETURN_VALUES = 4;

/**
 * Handles execution of public functions.
 */
export class PublicExecutor {
  constructor(
    /** Execution Context */
    private readonly context: PublicExecutionContext,

    private log = createDebugLogger('aztec:simulator:public-executor'),
  ) {}

  /**
   * Executes a public execution request.
   * @param execution - The execution to run.
   * @returns The result of the run plus all nested runs.
   */
  public async execute(execution: PublicExecution): Promise<PublicExecutionResult> {
    const selectorHex = execution.functionData.functionSelectorBuffer.toString('hex');
    this.log(`Executing public external function ${execution.contractAddress.toShortString()}:${selectorHex}`);

    const selector = execution.functionData.functionSelectorBuffer;
    const acir = await this.context.contractsDb.getBytecode(execution.contractAddress, selector);
    if (!acir) throw new Error(`Bytecode not found for ${execution.contractAddress.toShortString()}:${selectorHex}`);

    const initialWitness = getInitialWitness(execution.args, execution.callContext, this.context.historicRoots);
    const storageActions = new ContractStorageActionsCollector(this.context.publicStateDb, execution.contractAddress);
    
    // TODO: create a structure which keeps track of the preimages created when creating a transparent message

    const nestedExecutions: PublicExecutionResult[] = [];

    const notAvailable = () => Promise.reject(`Built-in not available for public execution simulation`);

    const { partialWitness } = await acvm(acir, initialWitness, {
      getSecretKey: notAvailable,
      getNotes2: notAvailable,
      getRandomField: notAvailable,
      notifyCreatedNote: notAvailable,
      notifyNullifiedNote: notAvailable,
      callPrivateFunction: notAvailable,
      enqueuePublicFunctionCall: notAvailable,
      viewNotesPage: notAvailable,
      debugLog: ([data]: ACVMField[]) => {
        // eslint-disable-next-line
        console.log(data);
        return Promise.resolve([ZERO_ACVM_FIELD]);
      },
      // l1 to l2 messages in public contexts TODO: https://github.com/AztecProtocol/aztec-packages/issues/616
      getTransparentMessage: notAvailable,

      getL1ToL2Message: ([msgKey]: ACVMField[]) => this.context.getL1ToL2Message(fromACVMField(msgKey)),
      notifyCreatedTransparentMessage: async ([content, secretHash]) => {
        const c = fromACVMField(content);
        const secretH = fromACVMField(secretHash);
        // await this.stateDb
        this.log(`Oracle Transparent Message creation: content=${c.toShortString()}, secretHash=${secretH.toShortString()}`)
        
        return await Promise.resolve([ZERO_ACVM_FIELD]);
      },
      storageRead: async ([slot]) => {
        const storageSlot = fromACVMField(slot);
        const value = await storageActions.read(storageSlot);
        this.log(`Oracle storage read: slot=${storageSlot.toShortString()} value=${value.toString()}`);
        return [toACVMField(value)];
      },
      storageWrite: async ([slot, value]) => {
        const storageSlot = fromACVMField(slot);
        const newValue = fromACVMField(value);
        await storageActions.write(storageSlot, newValue);
        await this.context.publicStateDb.storageWrite(execution.contractAddress, storageSlot, newValue);
        this.log(`Oracle storage write: slot=${storageSlot.toShortString()} value=${value.toString()}`);
        return [toACVMField(newValue)];
      },
      callPublicFunction: async ([address, functionSelector, ...args]) => {
        this.log(`Public function call: addr=${address} selector=${functionSelector} args=${args.join(',')}`);
        const childExecutionResult = await this.callPublicFunction(
          frToAztecAddress(fromACVMField(address)),
          frToSelector(fromACVMField(functionSelector)),
          args.map(f => fromACVMField(f)),
          execution.callContext,
        );

        nestedExecutions.push(childExecutionResult);
        this.log(`Returning from nested call: ret=${childExecutionResult.returnValues.join(', ')}`);
        return padArrayEnd(childExecutionResult.returnValues, Fr.ZERO, NOIR_MAX_RETURN_VALUES).map(toACVMField);
      },
    });

    const returnValues = selectPublicWitnessFlattened(acir, partialWitness).map(fromACVMField);
    const [contractStorageReads, contractStorageUpdateRequests] = storageActions.collect();

    return {
      execution,
      contractStorageReads,
      contractStorageUpdateRequests,
      returnValues,
      nestedExecutions,
    };
  }

  /**
   * Creates a PublicExecution out of a TxRequest to a public function.
   * @param input - The TxRequest calling a public function.
   * @returns A PublicExecution object that can be run via execute.
   */
  public async getPublicExecution(input: TxExecutionRequest): Promise<PublicExecution> {
    const contractAddress = input.to;
    const portalContractAddress = (await this.context.contractsDb.getPortalContractAddress(contractAddress)) ?? EthAddress.ZERO;
    const callContext: CallContext = new CallContext(input.from, input.to, portalContractAddress, false, false, false);

    return { callContext, contractAddress, functionData: input.functionData, args: input.args };
  }

  private async callPublicFunction(
    targetContractAddress: AztecAddress,
    targetFunctionSelector: Buffer,
    targetArgs: Fr[],
    callerContext: CallContext,
  ) {
    const portalAddress = (await this.context.contractsDb.getPortalContractAddress(targetContractAddress)) ?? EthAddress.ZERO;
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

    return this.execute(nestedExecution);
  }
}

/**
 * Generates the initial witness for a public function.
 * @param args - The arguments to the function.
 * @param callContext - The call context of the function.
 * @param witnessStartIndex - The index where to start inserting the parameters.
 * @returns The initial witness.
 */
function getInitialWitness(args: Fr[], callContext: CallContext, roots: PrivateHistoricTreeRoots, witnessStartIndex = 1) {
  return toACVMWitness(witnessStartIndex, [
    callContext.isContractDeployment,
    callContext.isDelegateCall,
    callContext.isStaticCall,
    callContext.msgSender,
    callContext.portalContractAddress,
    callContext.storageContractAddress,

    // TODO(Maddiaa): will we make the private execution look the same
    roots.contractTreeRoot,
    roots.l1ToL2MessagesTreeRoot,
    roots.nullifierTreeRoot,
    roots.privateDataTreeRoot,
    ...args,
  ]);
}
