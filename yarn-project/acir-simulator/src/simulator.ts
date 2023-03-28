import {
  CallContext,
  PrivateCircuitPublicInputs,
  EthAddress,
  OldTreeRoots,
  PrivateCallStackItem,
  TxRequest,
} from './circuits.js';
import { DBOracle } from './db_oracle.js';
import { ExecutionResult } from './execution.js';

/**
 * A placeholder for the Acir Simulator.
 */
export class AcirSimulator {
  constructor(private db: DBOracle) {}

  run(
    request: TxRequest,
    entryPointACIR: Buffer,
    portalContractAddress: EthAddress,
    oldRoots: OldTreeRoots,
  ): Promise<ExecutionResult> {
    const callContext = new CallContext(
      request.from,
      request.to,
      portalContractAddress,
      false,
      false,
      request.functionData.isConstructor,
    );

    const publicInputs = new PrivateCircuitPublicInputs(
      callContext,
      request.args,
      [], // returnValues,
      [], // emittedEvents,
      [], // newCommitments,
      [], // newNullifiers,
      [], // privateCallStack,
      [], // publicCallStack,
      [], // l1MsgStack,
      oldRoots.privateDataTreeRoot,
      oldRoots.nullifierTreeRoot,
      oldRoots.contractTreeRoot,
      request.txContext.contractDeploymentData,
    );

    return Promise.resolve({
      acir: entryPointACIR,
      partialWitness: Buffer.alloc(0),
      callStackItem: new PrivateCallStackItem(request.to, request.functionData.functionSelector, publicInputs),
      preimages: {
        newNotes: [],
        nullifiedNotes: [],
      },
      nestedExecutions: [],
    });
  }
}
