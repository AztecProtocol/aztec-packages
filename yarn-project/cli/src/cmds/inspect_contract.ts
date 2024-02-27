import { getContractClassFromArtifact } from '@aztec/circuits.js';
import {
  FunctionSelector,
  decodeFunctionSignature,
  decodeFunctionSignatureWithParameterNames,
} from '@aztec/foundation/abi';
import { DebugLogger, LogFn } from '@aztec/foundation/log';

import { getContractArtifact } from '../utils.js';

export async function inspectContract(contractArtifactFile: string, debugLogger: DebugLogger, log: LogFn) {
  const contractArtifact = await getContractArtifact(contractArtifactFile, debugLogger);
  const contractFns = contractArtifact.functions.filter(
    f => !f.isInternal && f.name !== 'compute_note_hash_and_nullifier',
  );
  if (contractFns.length === 0) {
    log(`No external functions found for contract ${contractArtifact.name}`);
  }
  const contractClass = getContractClassFromArtifact(contractArtifact);
  const bytecodeLengthInFields = 1 + Math.ceil(contractClass.packedBytecode.length / 31);

  log(`Contract class details:`);
  log(`\tidentifier: ${contractClass.id.toString()}`);
  log(`\tartifact hash: ${contractClass.artifactHash.toString()}`);
  log(`\tprivate function tree root: ${contractClass.privateFunctionsRoot.toString()}`);
  log(`\tpublic bytecode commitment: ${contractClass.publicBytecodeCommitment.toString()}`);
  log(`\tpublic bytecode length: ${contractClass.packedBytecode.length} bytes (${bytecodeLengthInFields} fields)`);
  log(`\nExternal functions:`);
  for (const fn of contractFns) {
    const signatureWithParameterNames = decodeFunctionSignatureWithParameterNames(fn.name, fn.parameters);
    const signature = decodeFunctionSignature(fn.name, fn.parameters);
    const selector = FunctionSelector.fromSignature(signature);
    log(
      `${fn.functionType} ${signatureWithParameterNames} \n\tfunction signature: ${signature}\n\tselector: ${selector}`,
    );
  }
}
