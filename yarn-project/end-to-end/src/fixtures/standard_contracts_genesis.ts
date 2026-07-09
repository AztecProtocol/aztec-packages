import type { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { getPublishableStandardContracts } from '@aztec/standard-contracts';
import { siloNullifier } from '@aztec/stdlib/hash';

/**
 * Computes the genesis nullifiers that pre-publish the standard contracts (AuthRegistry, PublicChecks,
 * HandshakeRegistry) in e2e environments, mirroring the nullifiers their on-chain publish txs would emit. Per contract:
 * - `siloNullifier(ContractClassRegistry, classId)` — the class-registration nullifier that `ContractClassRegistry.publish` pushes.
 * - `siloNullifier(ContractInstanceRegistry, instanceAddress)` — the instance-deployment nullifier that
 *   `ContractInstanceRegistry.publish_for_public_execution` pushes, using the contract's real derived address (standard
 *   contracts are deployed at artifact-derived addresses, not magic protocol addresses).
 *
 * Seed these into the genesis nullifier tree (as the 5th `getGenesisValues` arg) alongside the archiver's
 * `testPreloadStandardContracts` preload: the store preload makes the `ensure*Published` guards short-circuit, and these
 * nullifiers make the AVM's deployment-nullifier check pass when the contracts are called. Every e2e node genesis that
 * feeds an L1 `genesisArchiveRoot` must seed the same set, or the world-state root diverges from the deployed rollup.
 */
export async function getStandardContractGenesisNullifiers(): Promise<Fr[]> {
  const classRegistry = ProtocolContractAddress.ContractClassRegistry;
  const instanceRegistry = ProtocolContractAddress.ContractInstanceRegistry;
  const nullifiers: Fr[] = [];
  for (const { contractClass, address } of await getPublishableStandardContracts()) {
    nullifiers.push(await siloNullifier(classRegistry, contractClass.id));
    nullifiers.push(await siloNullifier(instanceRegistry, address.toField()));
  }
  return nullifiers;
}
