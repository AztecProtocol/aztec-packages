import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { FunctionCall } from '@aztec/stdlib/abi';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { CallContext, PrivateExecutionResult, TxExecutionRequest } from '@aztec/stdlib/tx';

import { createSimulationError } from '../common/errors.js';
import type { ExecutionDataProvider } from './execution_data_provider.js';
import { ExecutionNoteCache } from './execution_note_cache.js';
import { HashedValuesCache } from './hashed_values_cache.js';
import { executePrivateFunction, verifyCurrentClassId } from './private_execution.js';
import { PrivateExecutionOracle } from './private_execution_oracle.js';
import type { SimulationProvider } from './providers/simulation_provider.js';
import { executeUnconstrainedFunction } from './unconstrained_execution.js';
import { UnconstrainedExecutionOracle } from './unconstrained_execution_oracle.js';

/**
 * The ACIR simulator.
 */
export class AcirSimulator {
  private log: Logger;

  constructor(private executionDataProvider: ExecutionDataProvider, private simulationProvider: SimulationProvider) {
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
    const header = await this.executionDataProvider.getBlockHeader();

    await verifyCurrentClassId(
      contractAddress,
      await this.executionDataProvider.getContractInstance(contractAddress),
      this.executionDataProvider,
      header.globalVariables.blockNumber.toNumber(),
    );
    const entryPointArtifact = await this.executionDataProvider.getFunctionArtifact(contractAddress, selector);

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

    const context = new PrivateExecutionOracle(
      request.firstCallArgsHash,
      request.txContext,
      callContext,
      header,
      request.authWitnesses,
      request.capsules,
      HashedValuesCache.create(request.argsOfCalls),
      noteCache,
      this.executionDataProvider,
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
      await this.executionDataProvider.getContractInstance(contractAddress),
      this.executionDataProvider,
      await this.executionDataProvider.getBlockNumber(),
    );
    const entryPointArtifact = await this.executionDataProvider.getFunctionArtifact(contractAddress, selector);

    if (entryPointArtifact.functionType !== FunctionType.UNCONSTRAINED) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as unconstrained`);
    }

    const context = new UnconstrainedExecutionOracle(
      contractAddress,
      [],
      [],
      this.executionDataProvider,
      undefined,
      scopes,
    );

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
