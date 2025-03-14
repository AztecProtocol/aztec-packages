import { MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS, REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT } from '@aztec/constants';
import type { ExecutionPayload } from '@aztec/entrypoints/interfaces';
import { Fr } from '@aztec/foundation/fields';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type ContractArtifact, FunctionSelector, FunctionType, bufferAsFields } from '@aztec/stdlib/abi';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { Capsule } from '@aztec/stdlib/tx';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import { getRegistererContract } from '../contract/protocol_contracts.js';
import type { Wallet } from '../wallet/index.js';

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
): Promise<ExecutionPayload> {
  const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment, packedBytecode } =
    await getContractClassFromArtifact(artifact);
  const registerer = await getRegistererContract(wallet);
  const encodedBytecode = bufferAsFields(packedBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  const executionPayload: ExecutionPayload = {
    calls: [
      {
        name: 'register',
        to: registerer.address,
        selector: await FunctionSelector.fromSignature('register'),
        args: [artifactHash, privateFunctionsRoot, publicBytecodeCommitment, emitPublicBytecode ? Fr.ONE : Fr.ZERO],
        type: FunctionType.PRIVATE,
        isStatic: false,
        returnTypes: [],
      },
    ],
    capsules: [
      new Capsule(
        ProtocolContractAddress.ContractClassRegisterer,
        new Fr(REGISTERER_CONTRACT_BYTECODE_CAPSULE_SLOT),
        encodedBytecode,
      ),
    ],
    authWitnesses: [],
  };

  return executionPayload;
}
