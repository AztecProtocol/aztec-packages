import { MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type ContractArtifact, bufferAsFields } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { Capsule } from '@aztec/stdlib/tx';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { getRegistererContract } from '../contract/protocol_contracts.js';
import type { Wallet } from '../wallet/index.js';

/** Sets up a call to register a contract class given its artifact. */
export async function registerContractClass(
  wallet: Wallet,
  artifact: ContractArtifact,
): Promise<ContractFunctionInteraction> {
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment, packedBytecode } =
    await getContractClassFromArtifact(artifact);
  const registerer = await getRegistererContract(wallet);

  const encodedBytecode = bufferAsFields(packedBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  return registerer.methods.register(artifactHash, privateFunctionsRoot, publicBytecodeCommitment).with({
    capsules: [
      new Capsule(
        ProtocolContractAddress.ContractClassRegisterer,
        new Fr(REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT),
        encodedBytecode,
      ),
    ],
  });
}
