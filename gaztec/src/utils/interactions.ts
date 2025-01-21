import {
  ContractArtifact,
  FunctionArtifact,
  encodeArguments,
} from "@aztec/aztec.js";
import { FunctionType } from "@aztec/foundation/abi";

export const GITHUB_TAG_PREFIX = "aztec-packages";

function getFunctionArtifact(
  artifact: ContractArtifact,
  fnName: string
): FunctionArtifact {
  const fn = artifact.functions.find(({ name }) => name === fnName);
  if (!fn) {
    throw Error(`Function ${fnName} not found in contract ABI.`);
  }
  return fn;
}

export async function prepTx(
  contractArtifact: ContractArtifact,
  functionName: string,
  functionArgs: string[]
) {
  const functionArtifact = getFunctionArtifact(contractArtifact, functionName);
  const encodedArgs = encodeArguments(functionArtifact, functionArgs);
  const isPrivate = functionArtifact.functionType === FunctionType.PRIVATE;

  return { encodedArgs, contractArtifact, isPrivate };
}
