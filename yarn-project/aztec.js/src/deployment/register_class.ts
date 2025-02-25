import { type ContractArtifact, bufferAsFields } from '@aztec/circuits.js/abi';
import { getContractClassFromArtifact } from '@aztec/circuits.js/contract';
import { Capsule } from '@aztec/circuits.js/tx';
import { MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { type ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { type Wallet } from '../wallet/index.js';
import { getRegistererContract } from './protocol_contracts.js';

const defaultEmitPublicBytecode =
  // guard against `process` not being defined (e.g. in the browser)
  typeof process === 'object' && typeof process.env === 'object'
    ? ['1', 'true', 'yes', ''].includes(process.env.AZTEC_EMIT_PUBLIC_BYTECODE ?? '')
    : true;

/** Sets up a call to register a contract class given its artifact. */
export async function registerContractClass(
  wallet: Wallet,
  artifact: ContractArtifact,
  emitPublicBytecode = defaultEmitPublicBytecode,
): Promise<ContractFunctionInteraction> {
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment, packedBytecode } =
    await getContractClassFromArtifact(artifact);
  const registerer = await getRegistererContract(wallet);
  const fn = registerer.methods.register(
    artifactHash,
    privateFunctionsRoot,
    publicBytecodeCommitment,
    emitPublicBytecode,
  );

  const encodedBytecode = bufferAsFields(packedBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  fn.addCapsule(
    new Capsule(
      ProtocolContractAddress.ContractClassRegisterer,
      new Fr(REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT),
      encodedBytecode,
    ),
  );

  return fn;
}
