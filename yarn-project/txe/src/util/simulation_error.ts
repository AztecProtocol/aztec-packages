import { type SimulationError, isNoirCallStackUnresolved } from '@aztec/circuit-types';
import { AztecAddress, Fr, FunctionSelector, PUBLIC_DISPATCH_SELECTOR } from '@aztec/circuits.js';
import { type Logger } from '@aztec/foundation/log';
import { type ContractDataOracle } from '@aztec/pxe';
import { resolveAssertionMessage, resolveOpcodeLocations } from '@aztec/simulator';

import { type TXEDatabase } from './txe_database.js';

export async function enrichPublicSimulationError(
  err: SimulationError,
  db: TXEDatabase,
  contractDataOracle: ContractDataOracle,
  logger: Logger,
) {
  // Try to fill in the noir call stack since the PXE may have access to the debug metadata
  const callStack = err.getCallStack();
  const originalFailingFunction = callStack[callStack.length - 1];
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Properly fix this.
  // To be able to resolve the assertion message, we need to use the information from the public dispatch function,
  // no matter what the call stack selector points to (since we've modified it to point to the target function).
  // We should remove this because the AVM (or public protocol) shouldn't be aware of the public dispatch calling convention.
  const debugInfo = await contractDataOracle.getFunctionDebugMetadata(
    originalFailingFunction.contractAddress,
    FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
  );
  const noirCallStack = err.getNoirCallStack();
  if (debugInfo) {
    if (isNoirCallStackUnresolved(noirCallStack)) {
      const assertionMessage = resolveAssertionMessage(noirCallStack, debugInfo);
      if (assertionMessage) {
        err.setOriginalMessage(err.getOriginalMessage() + `: ${assertionMessage}`);
      }
      try {
        // Public functions are simulated as a single Brillig entry point.
        // Thus, we can safely assume here that the Brillig function id is `0`.
        const parsedCallStack = resolveOpcodeLocations(noirCallStack, debugInfo, 0);
        err.setNoirCallStack(parsedCallStack);
      } catch (err) {
        logger.warn(
          `Could not resolve noir call stack for ${originalFailingFunction.contractAddress.toString()}:${originalFailingFunction.functionSelector.toString()}: ${err}`,
        );
      }
    }
  }
  await enrichSimulationError(err, db);
}

export async function enrichSimulationError(err: SimulationError, db: TXEDatabase) {
  // Maps contract addresses to the set of functions selectors that were in error.
  // Using strings because map and set don't use .equals()
  const mentionedFunctions: Map<string, Set<string>> = new Map();

  err.getCallStack().forEach(({ contractAddress, functionSelector }) => {
    if (!mentionedFunctions.has(contractAddress.toString())) {
      mentionedFunctions.set(contractAddress.toString(), new Set());
    }
    mentionedFunctions.get(contractAddress.toString())!.add(functionSelector.toString());
  });

  await Promise.all(
    [...mentionedFunctions.entries()].map(async ([contractAddress, selectors]) => {
      const parsedContractAddress = AztecAddress.fromString(contractAddress);
      const contract = await db.getContract(parsedContractAddress);
      if (contract) {
        err.enrichWithContractName(parsedContractAddress, contract.name);
        selectors.forEach(selector => {
          const functionArtifact = contract.functions.find(f => FunctionSelector.fromString(selector).equals(f));
          if (functionArtifact) {
            err.enrichWithFunctionName(
              parsedContractAddress,
              FunctionSelector.fromNameAndParameters(functionArtifact),
              functionArtifact.name,
            );
          }
        });
      }
    }),
  );
}
