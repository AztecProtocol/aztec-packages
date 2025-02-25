import { type FunctionCall } from '@aztec/circuits.js/abi';
import { FunctionSelector, FunctionType } from '@aztec/circuits.js/abi';
import { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { type AztecNode } from '@aztec/circuits.js/interfaces/client';
import { CallContext, PrivateExecutionResult, TxExecutionRequest } from '@aztec/circuits.js/tx';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { createSimulationError } from '../common/errors.js';
import { HashedValuesCache } from '../common/hashed_values_cache.js';
import { type SimulationProvider } from '../common/simulation_provider.js';
import { ClientExecutionContext } from './client_execution_context.js';
import { type DBOracle } from './db_oracle.js';
import { ExecutionNoteCache } from './execution_note_cache.js';
import { executePrivateFunction, verifyCurrentClassId } from './private_execution.js';
import { executeUnconstrainedFunction } from './unconstrained_execution.js';
import { ViewDataOracle } from './view_data_oracle.js';

/**
 * The ACIR simulator.
 */
export class AcirSimulator {
  private log: Logger;

  constructor(private db: DBOracle, private node: AztecNode, private simulationProvider: SimulationProvider) {
    this.log = createLogger('simulator');
  }

  /**
   * Runs a private function.
   * @param request - The transaction request.
   * @param entryPointArtifact - The artifact of the entry point function.
   * @param contractAddress - The address of the contract (should match request.origin)
   * @param msgSender - The address calling the function. This can be replaced to simulate a call from another contract or a specific account.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns The result of the execution.
   */
  public async run(
    request: TxExecutionRequest,
    contractAddress: AztecAddress,
    selector: FunctionSelector,
    msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE),
    scopes?: AztecAddress[],
  ): Promise<PrivateExecutionResult> {
    const header = await this.db.getBlockHeader();

    await verifyCurrentClassId(
      contractAddress,
      await this.db.getContractInstance(contractAddress),
      this.node,
      header.globalVariables.blockNumber.toNumber(),
    );
    const entryPointArtifact = await this.db.getFunctionArtifact(contractAddress, selector);

    if (entryPointArtifact.functionType !== FunctionType.PRIVATE) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as private`);
    }

    if (request.origin !== contractAddress) {
      this.log.warn(
        `Request origin does not match contract address in simulation. Request origin: ${request.origin}, contract address: ${contractAddress}`,
      );
    }

    // reserve the first side effect for the tx hash (inserted by the private kernel)
    const startSideEffectCounter = 1;

    const callContext = new CallContext(
      msgSender,
      contractAddress,
      await FunctionSelector.fromNameAndParameters(entryPointArtifact.name, entryPointArtifact.parameters),
      entryPointArtifact.isStatic,
    );

    const txRequestHash = await request.toTxRequest().hash();
    const noteCache = new ExecutionNoteCache(txRequestHash);

    const context = new ClientExecutionContext(
      request.firstCallArgsHash,
      request.txContext,
      callContext,
      header,
      request.authWitnesses,
      request.capsules,
      HashedValuesCache.create(request.argsOfCalls),
      noteCache,
      this.db,
      this.node,
      this.simulationProvider,
      startSideEffectCounter,
      undefined,
      scopes,
    );

    try {
      const executionResult = await executePrivateFunction(
        this.simulationProvider,
        context,
        entryPointArtifact,
        contractAddress,
        request.functionSelector,
      );
      const { usedTxRequestHashForNonces } = noteCache.finish();
      const firstNullifierHint = usedTxRequestHashForNonces ? Fr.ZERO : noteCache.getAllNullifiers()[0];
      return new PrivateExecutionResult(executionResult, firstNullifierHint);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }

  /**
   * Runs an unconstrained function.
   * @param request - The transaction request.
   * @param entryPointArtifact - The artifact of the entry point function.
   * @param contractAddress - The address of the contract.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   */
  public async runUnconstrained(
    request: FunctionCall,
    contractAddress: AztecAddress,
    selector: FunctionSelector,
    scopes?: AztecAddress[],
  ) {
    await verifyCurrentClassId(
      contractAddress,
      await this.db.getContractInstance(contractAddress),
      this.node,
      await this.node.getBlockNumber(),
    );
    const entryPointArtifact = await this.db.getFunctionArtifact(contractAddress, selector);

    if (entryPointArtifact.functionType !== FunctionType.UNCONSTRAINED) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as unconstrained`);
    }

    const context = new ViewDataOracle(contractAddress, [], [], this.db, this.node, undefined, scopes);

    try {
      return await executeUnconstrainedFunction(
        this.simulationProvider,
        context,
        entryPointArtifact,
        contractAddress,
        request.selector,
        request.args,
      );
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }
}
