// Genesis predeploy of auth_registry.
//
// auth_registry was demoted from protocol contract to a non-protocol contract; its address now
// derives from its compiled artifact (salt = Fr(1), deployer = AztecAddress::zero(),
// public_keys = default). Because no protocol-contracts pipeline pre-publishes it any longer,
// the node performs a one-time genesis deploy through the standard ContractClassRegistry +
// ContractInstanceRegistry publication path.
//
// Idempotent: a second invocation reverts inside ContractInstanceRegistry because the instance
// already exists; we tolerate that revert and log it at debug.

import { createLogger } from '@aztec/foundation/log';
import { getAuthRegistryAddress, getAuthRegistryClassId, getCanonicalAuthRegistry } from '@aztec/protocol-contracts/auth-registry';

const log = createLogger('aztec:genesis:auth-registry');

export interface AuthRegistryDeployer {
  publishContractClass(classId: bigint, artifactHash: bigint, packedBytecode: Buffer): Promise<void>;
  publishContractInstance(address: bigint, classId: bigint, salt: bigint): Promise<void>;
}

/**
 * Publish auth_registry's contract class and instance at genesis.
 *
 * Re-runs are safe: the second call will revert in ContractInstanceRegistry because the instance
 * already exists. The deployer hook is expected to swallow that specific revert and surface
 * anything else.
 */
export async function deployAuthRegistry(deployer: AuthRegistryDeployer): Promise<void> {
  const protocolContract = await getCanonicalAuthRegistry();
  const address = getAuthRegistryAddress();
  const classId = getAuthRegistryClassId();
  const { contractClass, instance } = protocolContract;

  log.info('Publishing auth_registry contract class at genesis', {
    address: address.toString(),
    classId: classId.toString(),
  });

  await deployer.publishContractClass(
    contractClass.id.toBigInt(),
    contractClass.artifactHash.toBigInt(),
    contractClass.packedBytecode,
  );

  await deployer.publishContractInstance(address.toBigInt(), instance.currentContractClassId.toBigInt(), instance.salt.toBigInt());
}
