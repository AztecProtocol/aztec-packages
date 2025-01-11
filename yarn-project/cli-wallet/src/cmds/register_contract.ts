import {
  type AccountWalletWithSecretKey,
  type AztecAddress,
  type Fr,
  PublicKeys,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import { getContractArtifact } from '@aztec/cli/cli-utils';
import { getInitializer } from '@aztec/foundation/abi';
import { type LogFn } from '@aztec/foundation/log';

export async function registerContract(
  wallet: AccountWalletWithSecretKey,
  address: AztecAddress,
  artifactPath: string,
  initializer: string,
  publicKeys: PublicKeys | undefined,
  rawArgs: any[],
  salt: Fr,
  deployer: AztecAddress | undefined,
  log: LogFn,
) {
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const constructorArtifact = getInitializer(contractArtifact, initializer);
  const contractInstance = getContractInstanceFromDeployParams(contractArtifact, {
    constructorArtifact,
    publicKeys: publicKeys ?? PublicKeys.default(),
    constructorArgs: rawArgs,
    salt,
    deployer,
  });
  if (!contractInstance.address.equals(address)) {
    throw new Error(`Contract address mismatch: expected ${address}, got ${contractInstance.address}`);
  }
  await wallet.registerContract({ instance: contractInstance, artifact: contractArtifact });
  log(`Contract registered: at ${contractInstance.address}`);
  return contractInstance;
}
