import { sha256 } from '@aztec/foundation/crypto';
import type { LogFn, Logger } from '@aztec/foundation/log';
import {
  type FunctionArtifact,
  FunctionSelector,
  decodeFunctionSignature,
  decodeFunctionSignatureWithParameterNames,
  retainBytecode,
} from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { getContractArtifact } from '../../utils/aztec.js';

export async function inspectContract(contractArtifactFile: string, debugLogger: Logger, log: LogFn) {
  const contractArtifact = await getContractArtifact(contractArtifactFile, log);
  const contractFns = contractArtifact.functions.concat(
    contractArtifact.nonDispatchPublicFunctions.map(f => f as FunctionArtifact),
  );
  if (contractFns.length === 0) {
    log(`No functions found for contract ${contractArtifact.name}`);
  }
  const contractClass = await getContractClassFromArtifact(contractArtifact);
  const bytecodeLengthInFields = 1 + Math.ceil(contractClass.packedBytecode.length / 31);

  log(`Contract class details:`);
  log(`\tidentifier: ${contractClass.id.toString()}`);
  log(`\tartifact hash: ${contractClass.artifactHash.toString()}`);
  log(`\tprivate function tree root: ${contractClass.privateFunctionsRoot.toString()}`);
  log(`\tpublic bytecode commitment: ${contractClass.publicBytecodeCommitment.toString()}`);
  log(`\tpublic bytecode length: ${contractClass.packedBytecode.length} bytes (${bytecodeLengthInFields} fields)`);

  const externalFunctions = contractFns.filter(f => !f.isInternal);
  if (externalFunctions.length > 0) {
    log(`\nExternal functions:`);
    await Promise.all(externalFunctions.map(f => logFunction(f, log)));
  }

  const internalFunctions = contractFns.filter(f => f.isInternal);
  if (internalFunctions.length > 0) {
    log(`\nInternal functions:`);
    await Promise.all(internalFunctions.map(f => logFunction(f, log)));
  }
}

async function logFunction(fn: FunctionArtifact, log: LogFn) {
  const signatureWithParameterNames = decodeFunctionSignatureWithParameterNames(fn.name, fn.parameters);
  const signature = decodeFunctionSignature(fn.name, fn.parameters);
  const selector = await FunctionSelector.fromSignature(signature);

  if (retainBytecode(fn)) {
    const bytecodeSize = fn.bytecode.length;
    const bytecodeHash = sha256(fn.bytecode).toString('hex');
    log(
      `${fn.functionType} ${signatureWithParameterNames} \n\tfunction signature: ${signature}\n\tselector: ${selector}\n\tbytecode: ${bytecodeSize} bytes (sha256 ${bytecodeHash})`,
    );
  } else {
    log(
      `${fn.functionType} ${signatureWithParameterNames} \n\tfunction signature: ${signature}\n\tselector: ${selector}`,
    );
  }
}
