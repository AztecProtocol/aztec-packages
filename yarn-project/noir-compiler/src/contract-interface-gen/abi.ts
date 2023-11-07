import { ContractArtifact, DebugMetadata, FunctionArtifact, FunctionType } from '@aztec/foundation/abi';

import { deflate } from 'pako';

import { mockVerificationKey } from '../mocked_keys.js';
import {
  NoirCompilationResult,
  NoirContractCompilationArtifacts,
  NoirFunctionEntry,
  NoirProgramCompilationArtifacts,
  ProgramArtifact,
  isNoirContractCompilationArtifacts,
  isNoirProgramCompilationArtifacts,
} from '../noir_artifact.js';

/**
 * Generates a function build artifact. Replaces verification key with a mock value.
 * @param fn - Noir function entry.
 * @returns Function artifact.
 */
function generateFunctionArtifact(fn: NoirFunctionEntry): FunctionArtifact {
  const functionType = fn.function_type.toLowerCase() as FunctionType;
  const isInternal = fn.is_internal;

  // If the function is not unconstrained, the first item is inputs or CallContext which we should omit
  let parameters = fn.abi.parameters;
  if (functionType !== FunctionType.UNCONSTRAINED) parameters = parameters.slice(1);

  // If the function is secret, the return is the public inputs, which should be omitted
  const returnTypes = functionType === FunctionType.SECRET ? [] : [fn.abi.return_type];

  return {
    name: fn.name,
    functionType,
    isInternal,
    parameters,
    returnTypes,
    bytecode: fn.bytecode,
    verificationKey: mockVerificationKey,
  };
}

/**
 * Entrypoint for generating the .json artifact for compiled contract or program
 * @param compileResult - Noir build output.
 * @returns Aztec contract build artifact.
 */
export function generateArtifact(compileResult: NoirCompilationResult) {
  if (isNoirContractCompilationArtifacts(compileResult)) {
    return generateContractArtifact(compileResult);
  } else if (isNoirProgramCompilationArtifacts(compileResult)) {
    return generateProgramArtifact(compileResult);
  } else {
    throw Error('Unsupported artifact type');
  }
}

/**
 * Given a Nargo output generates an Aztec-compatible contract artifact.
 * @param compiled - Noir build output.
 * @returns Aztec contract build artifact.
 */
export function generateProgramArtifact({ program, debug }: NoirProgramCompilationArtifacts): ProgramArtifact {
  // let parsedDebug: NoirDebugMetadata | undefined = undefined;
  // if (debug) {
  //   parsedDebug = {
  //     debug_symbols: sortedFunctions.map(fn => {
  //       const originalIndex = originalFunctions.indexOf(fn);
  //       return Buffer.from(deflate(JSON.stringify(debug.debug_symbols[originalIndex]))).toString('base64');
  //     }),
  //     file_map: debug.file_map,
  //   };
  // }

  return {
    hash: program.hash,
    backend: program.backend,
    abi: program.abi,

    // TODO: parse the debug
    debug,
  };
}

/**
 * Given a Nargo output generates an Aztec-compatible contract artifact.
 * @param compiled - Noir build output.
 * @returns Aztec contract build artifact.
 */
export function generateContractArtifact(
  { contract, debug }: NoirContractCompilationArtifacts,
  aztecNrVersion?: string,
): ContractArtifact {
  const originalFunctions = contract.functions;
  // TODO why sort? we should have idempotent compilation so this should not be needed.
  const sortedFunctions = [...contract.functions].sort((fnA, fnB) => fnA.name.localeCompare(fnB.name));
  let parsedDebug: DebugMetadata | undefined = undefined;

  if (debug) {
    parsedDebug = {
      debugSymbols: sortedFunctions.map(fn => {
        const originalIndex = originalFunctions.indexOf(fn);
        return Buffer.from(deflate(JSON.stringify(debug.debug_symbols[originalIndex]))).toString('base64');
      }),
      fileMap: debug.file_map,
    };
  }

  const artifact: ContractArtifact = {
    name: contract.name,
    functions: sortedFunctions.map(generateFunctionArtifact),
    events: contract.events,
    debug: parsedDebug,
    aztecNrVersion,
  };
  return artifact;
}
