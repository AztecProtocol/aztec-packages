import { AztecAddress, CircuitsWasm, EthAddress, Fr } from '@aztec/circuits.js';
import { computeSecretMessageHash } from '@aztec/circuits.js/abis';
import { ContractArtifact, getFunctionDebugMetadata } from '@aztec/foundation/abi';
import { sha256ToField } from '@aztec/foundation/crypto';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/types';

import { FunctionArtifactWithDebugMetadata } from '../index.js';

/**
 * Test utility function to craft an L1 to L2 message.
 * @param selector - The cross chain message selector.
 * @param contentPreimage - The args after the selector.
 * @param targetContract - The contract to consume the message.
 * @param secret - The secret to unlock the message.
 * @returns The L1 to L2 message.
 */
export const buildL1ToL2Message = async (
  selector: string,
  contentPreimage: Fr[],
  targetContract: AztecAddress,
  secret: Fr,
): Promise<L1ToL2Message> => {
  const wasm = await CircuitsWasm.get();

  // Write the selector into a buffer.
  const selectorBuf = Buffer.from(selector, 'hex');

  const contentBuf = Buffer.concat([selectorBuf, ...contentPreimage.map(field => field.toBuffer())]);
  const content = sha256ToField(contentBuf);

  const secretHash = computeSecretMessageHash(wasm, secret);

  // Eventually the kernel will need to prove the kernel portal pair exists within the contract tree,
  // EthAddress.random() will need to be replaced when this happens
  return new L1ToL2Message(
    new L1Actor(EthAddress.random(), 1),
    new L2Actor(targetContract, 1),
    content,
    secretHash,
    0,
    0,
  );
};

export const getFunctionArtifact = (
  artifact: ContractArtifact,
  functionName: string,
): FunctionArtifactWithDebugMetadata => {
  const functionIndex = artifact.functions.findIndex(f => f.name === functionName);
  if (functionIndex < 0) {
    throw new Error(`Unknown function ${functionName}`);
  }
  const functionArtifact = artifact.functions[functionIndex];

  const debug = getFunctionDebugMetadata(artifact, functionName);

  return { ...functionArtifact, debug };
};
