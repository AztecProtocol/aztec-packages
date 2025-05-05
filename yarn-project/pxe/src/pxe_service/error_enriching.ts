import type { Logger } from '@aztec/foundation/log';
import { resolveAssertionMessageFromRevertData, resolveOpcodeLocations } from '@aztec/simulator/client';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type SimulationError, isNoirCallStackUnresolved } from '@aztec/stdlib/errors';

import type { ContractDataProvider } from '../storage/contract_data_provider/contract_data_provider.js';

/**
 * Adds contract and function names to a simulation error, if they
 * can be found in the PXE database
 * @param err - The error to enrich.
 */
export async function enrichSimulationError(
  err: SimulationError,
  contractDataProvider: ContractDataProvider,
  logger: Logger,
) {
  // Maps contract addresses to the set of function selectors that were in error.
  // Map and Set do reference equality for their keys instead of value equality, so we store the string
  // representation to get e.g. different contract address objects with the same address value to match.
  const mentionedFunctions: Map<string, Set<FunctionSelector>> = new Map();

  err.getCallStack().forEach(({ contractAddress, functionSelector }) => {
    if (!mentionedFunctions.has(contractAddress.toString())) {
      mentionedFunctions.set(contractAddress.toString(), new Set());
    }
    if (functionSelector) {
      mentionedFunctions.get(contractAddress.toString())!.add(functionSelector);
    }
  });

  await Promise.all(
    [...mentionedFunctions.entries()].map(async ([contractAddress, fnSelectors]) => {
      const parsedContractAddress = AztecAddress.fromString(contractAddress);
      const contract = await contractDataProvider.getContract(parsedContractAddress);
      if (contract) {
        err.enrichWithContractName(parsedContractAddress, contract.name);
        // Map from function selector to function name. It uses a stringified key for the same reason as mentionedFunctions.
        const selectorToNameMap: Map<string, string> = new Map();
        await Promise.all(
          contract.functions.map(async fn => {
            const selector = await FunctionSelector.fromNameAndParameters(fn);
            selectorToNameMap.set(selector.toString(), fn.name);
          }),
        );

        for (const fnSelector of fnSelectors) {
          if (selectorToNameMap.has(fnSelector.toString())) {
            err.enrichWithFunctionName(
              parsedContractAddress,
              fnSelector,
              selectorToNameMap.get(fnSelector.toString())!,
            );
          } else {
            logger.warn(
              `Could not find function artifact in contract ${contract.name} for function '${fnSelector}' when enriching error callstack`,
            );
          }
        }
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
  contractDataProvider: ContractDataProvider,
  logger: Logger,
) {
  const callStack = err.getCallStack();
  const originalFailingFunction = callStack[callStack.length - 1];

  const artifact = await contractDataProvider.getPublicFunctionArtifact(originalFailingFunction.contractAddress);
  if (!artifact) {
    throw new Error(
      `Artifact not found when enriching public simulation error. Contract address: ${originalFailingFunction.contractAddress}.`,
    );
  }

  const assertionMessage = resolveAssertionMessageFromRevertData(err.revertData, artifact);
  if (assertionMessage) {
    err.setOriginalMessage(err.getOriginalMessage() + `${assertionMessage}`);
  }

  const debugInfo = await contractDataProvider.getPublicFunctionDebugMetadata(originalFailingFunction.contractAddress);

  const noirCallStack = err.getNoirCallStack();
  if (debugInfo) {
    if (isNoirCallStackUnresolved(noirCallStack)) {
      try {
        // Public functions are simulated as a single Brillig entry point.
        // Thus, we can safely assume here that the Brillig function id is `0`.
        const parsedCallStack = resolveOpcodeLocations(noirCallStack, debugInfo.debugSymbols, debugInfo.files, 0);
        err.setNoirCallStack(parsedCallStack);
      } catch (err) {
        logger.warn(
          `Could not resolve noir call stack for ${originalFailingFunction.contractAddress.toString()}:${
            originalFailingFunction.functionName?.toString() ?? ''
          }: ${err}`,
        );
      }
    }
    await enrichSimulationError(err, contractDataProvider, logger);
  }
}
