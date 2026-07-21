/**
 * Shared account contract instantiation logic.
 *
 * Centralizes the key derivation + contract setup sequence used by
 * account creation, deployment, and registration.
 */

import { getAztecCore } from './aztec-imports';

/**
 * Derives keys and instantiates a Schnorr account contract from a secret and salt.
 *
 * Returns everything needed for PXE registration and deployment:
 * - secretFr / saltFr — field element versions of the inputs
 * - publicKeys — derived public keys
 * - signingKey — Schnorr signing key
 * - accountContract — the SchnorrAccountContract instance
 * - artifact — the contract artifact
 * - instance — the contract instance with computed address
 */
export async function instantiateAccount(secret: string, salt: string) {
  const {
    Fr,
    deriveKeys,
    deriveSigningKey,
    SchnorrAccountContract,
    getContractInstanceFromInstantiationParams,
  } = await getAztecCore();

  const secretFr = Fr.fromString(secret);
  const saltFr = Fr.fromString(salt);

  const { publicKeys } = await deriveKeys(secretFr);
  const signingKey = deriveSigningKey(secretFr);
  const accountContract = new SchnorrAccountContract(signingKey);

  const initInfo = await accountContract.getInitializationFunctionAndArgs();
  const { constructorName, constructorArgs } = initInfo ?? {
    constructorName: undefined,
    constructorArgs: undefined,
  };
  const artifact = await accountContract.getContractArtifact();

  const instance = await getContractInstanceFromInstantiationParams(artifact, {
    constructorArtifact: constructorName,
    constructorArgs,
    salt: saltFr,
    publicKeys,
  });

  return {
    secretFr,
    saltFr,
    publicKeys,
    signingKey,
    accountContract,
    artifact,
    instance,
  };
}
