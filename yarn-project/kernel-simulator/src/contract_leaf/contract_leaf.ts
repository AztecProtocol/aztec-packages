import { EthAddress, GrumpkinAddress } from '@aztec/barretenberg/address';
import { Hasher, MemoryMerkleTree } from '@aztec/barretenberg/merkle_tree';
import { computeSelector, ContractAbi } from '../contract_abi.js';

/**
 * Computes the contract address.
 * @param deployerAddress - The address of the contract deployer.
 * @param deploymentSalt - A random number to be able to mutate contract addresses.
 * @param args - The arguments to the constructor.
 * @param functionTreeRoot - The root of the function tree.
 * @param abi - The contract ABI.
 * @param hasher - The hasher to use.
 * @returns The contract address.
 */
export function computeContractAddress(
  deployerAddress: GrumpkinAddress,
  deploymentSalt: Buffer,
  args: Buffer,
  functionTreeRoot: Buffer,
  abi: ContractAbi,
  hasher: Hasher,
) {
  const constructorABI = abi.functions.find(functionAbi => functionAbi.isConstructor);
  if (!constructorABI) {
    throw new Error('No constructor found in contract ABI');
  }

  const vkHash = hasher.hashToField(Buffer.from(constructorABI.verificationKey, 'hex'));
  const argsHash = hasher.hashToField(args);
  const selector = computeSelector(constructorABI, hasher);

  const constructorHash = hasher.hashToField(Buffer.concat([selector, argsHash, vkHash]));

  return hasher.hashToField(
    Buffer.concat([deployerAddress.toBuffer(), deploymentSalt, functionTreeRoot, constructorHash]),
  );
}

/**
 * Hashes together the needed information to compute the contract leaf.
 * @param contractAddress - The address of the contract.
 * @param portalContractAddress - The eth portal contract address.
 * @param functionTreeRoot - The root of the function tree.
 * @param hasher - The hasher to use.
 * @returns The contract leaf.
 */
export function computeContractLeaf(
  contractAddress: Buffer,
  portalContractAddress: EthAddress,
  functionTreeRoot: Buffer,
  hasher: Hasher,
) {
  return hasher.hashToField(Buffer.concat([contractAddress, portalContractAddress.toBuffer(), functionTreeRoot]));
}
