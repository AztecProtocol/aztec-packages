import {
  type AztecAddress,
  type AztecNode,
  Fr,
  PublicKeys,
  type Wallet,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js';
import { getContractArtifact } from '@aztec/cli/cli-utils';
import type { LogFn } from '@aztec/foundation/log';
import { getAllFunctionAbis, getInitializer } from '@aztec/stdlib/abi';

export async function registerContract(
  wallet: Wallet,
  node: AztecNode,
  address: AztecAddress,
  artifactPath: string,
  log: LogFn,
  initializer?: string,
  publicKeys?: PublicKeys,
  rawArgs?: any[],
  salt?: Fr,
  deployer?: AztecAddress,
) {
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const hasInitializer = getAllFunctionAbis(contractArtifact).some(fn => fn.isInitializer);
  const constructorArtifact = hasInitializer ? getInitializer(contractArtifact, initializer) : undefined;
  let contractInstance = await node.getContract(address);
  if (!contractInstance) {
    log(`Contract not found in the node at ${address}. Computing instance locally...`);
    contractInstance = await getContractInstanceFromInstantiationParams(contractArtifact, {
      constructorArtifact,
      publicKeys: publicKeys ?? PublicKeys.default(),
      constructorArgs: rawArgs,
      salt: salt ?? Fr.ZERO,
      deployer,
    });
  }
  if (!contractInstance.address.equals(address)) {
    throw new Error(`Contract address mismatch: expected ${address}, got ${contractInstance.address}`);
  }
  await wallet.registerContract(contractInstance, contractArtifact);
  log(`Contract registered: at ${contractInstance.address}`);
  return contractInstance;
}
