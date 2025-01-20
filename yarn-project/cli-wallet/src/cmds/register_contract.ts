import { type AccountWalletWithSecretKey, type AztecAddress, type AztecNode } from '@aztec/aztec.js';
import { getContractArtifact } from '@aztec/cli/cli-utils';
import { type LogFn } from '@aztec/foundation/log';

export async function registerContract(
  wallet: AccountWalletWithSecretKey,
  node: AztecNode,
  address: AztecAddress,
  artifactPath: string,
  log: LogFn,
) {
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const contractInstance = await node.getContract(address);
  if (!contractInstance) {
    throw new Error(`Contract not found at address: ${address}`);
  }
  await wallet.registerContract({ instance: contractInstance, artifact: contractArtifact });
  log(`Contract registered: at ${contractInstance.address}`);
  return contractInstance;
}
