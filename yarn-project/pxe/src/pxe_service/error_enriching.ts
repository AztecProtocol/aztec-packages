import { type SimulationError, isNoirCallStackUnresolved } from '@aztec/circuit-types';
import { AztecAddress, Fr, FunctionSelector, PUBLIC_DISPATCH_SELECTOR } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { resolveAssertionMessageFromRevertData, resolveOpcodeLocations } from '@aztec/simulator/errors';

import { type ContractDataOracle, type PxeDatabase } from '../index.js';

/**
 * Adds contract and function names to a simulation error, if they
 * can be found in the PXE database
 * @param err - The error to enrich.
 */
export async function enrichSimulationError(err: SimulationError, db: PxeDatabase, logger: Logger) {
  // Maps contract addresses to the set of function names that were in error.
  // Map and Set do reference equality for their keys instead of value equality, so we store the string
  // representation to get e.g. different contract address objects with the same address value to match.
  const mentionedFunctions: Map<string, Set<string>> = new Map();

  err.getCallStack().forEach(({ contractAddress, functionName }) => {
    if (!mentionedFunctions.has(contractAddress.toString())) {
      mentionedFunctions.set(contractAddress.toString(), new Set());
    }
    mentionedFunctions.get(contractAddress.toString())!.add(functionName?.toString() ?? '');
  });

  await Promise.all(
    [...mentionedFunctions.entries()].map(async ([contractAddress, fnNames]) => {
      const parsedContractAddress = AztecAddress.fromString(contractAddress);
      const contract = await db.getContract(parsedContractAddress);
      if (contract) {
        err.enrichWithContractName(parsedContractAddress, contract.name);
        fnNames.forEach(fnName => {
          const functionArtifact = contract.functions.find(f => fnName === f.name);
          if (functionArtifact) {
            err.enrichWithFunctionName(
              parsedContractAddress,
              FunctionSelector.fromNameAndParameters(functionArtifact),
              functionArtifact.name,
            );
          } else {
            logger.warn(
              `Could not function artifact in contract ${contract.name} for function '${fnName}' when enriching error callstack`,
            );
          }
        });
      } else {
        logger.warn(
          `Could not find contract in database for address: ${parsedContractAddress} when enriching error callstack`,
        );
      }
    }),
  );
}

export async function enrichPublicSimulationError(
  err: SimulationError,
  contractDataOracle: ContractDataOracle,
  db: PxeDatabase,
  logger: Logger,
) {
  const callStack = err.getCallStack();
  const originalFailingFunction = callStack[callStack.length - 1];
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Properly fix this.
  // To be able to resolve the assertion message, we need to use the information from the public dispatch function,
  // no matter what the call stack selector points to (since we've modified it to point to the target function).
  // We should remove this because the AVM (or public protocol) shouldn't be aware of the public dispatch calling convention.

  const artifact = await contractDataOracle.getFunctionArtifact(
    originalFailingFunction.contractAddress,
    FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
  );
  const assertionMessage = resolveAssertionMessageFromRevertData(err.revertData, artifact);
  if (assertionMessage) {
    err.setOriginalMessage(err.getOriginalMessage() + `${assertionMessage}`);
  }

  const debugInfo = await contractDataOracle.getFunctionDebugMetadata(
    originalFailingFunction.contractAddress,
    FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
  );

  const noirCallStack = err.getNoirCallStack();
  if (debugInfo) {
    if (isNoirCallStackUnresolved(noirCallStack)) {
      try {
        // Public functions are simulated as a single Brillig entry point.
        // Thus, we can safely assume here that the Brillig function id is `0`.
        const parsedCallStack = resolveOpcodeLocations(noirCallStack, debugInfo, 0);
        err.setNoirCallStack(parsedCallStack);
      } catch (err) {
        logger.warn(
          `Could not resolve noir call stack for ${originalFailingFunction.contractAddress.toString()}:${
            originalFailingFunction.functionName?.toString() ?? ''
          }: ${err}`,
        );
      }
    }
    await enrichSimulationError(err, db, logger);
  }
}
