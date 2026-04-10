import { BaseAccount } from '@aztec/aztec.js/account';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import SimulatedEcdsaAccountContract from '../../artifacts/SimulatedEcdsaAccount.json' with { type: 'json' };
import SimulatedSchnorrAccountContract from '../../artifacts/SimulatedSchnorrAccount.json' with { type: 'json' };
import { StubBaseAccountContract } from './account_contract.js';

export const StubSchnorrAccountContractArtifact = loadContractArtifact(
  SimulatedSchnorrAccountContract as NoirCompiledContract,
);
export const StubEcdsaAccountContractArtifact = loadContractArtifact(
  SimulatedEcdsaAccountContract as NoirCompiledContract,
);

/**
 * Stub account contract for Schnorr accounts.
 * Eagerly loads the contract artifact.
 */
export class StubSchnorrAccountContract extends StubBaseAccountContract {
  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(StubSchnorrAccountContractArtifact);
  }
}

/**
 * Stub account contract for ECDSA accounts (secp256k1 and secp256r1).
 * Eagerly loads the contract artifact.
 */
export class StubEcdsaAccountContract extends StubBaseAccountContract {
  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(StubEcdsaAccountContractArtifact);
  }
}

/**
 * Creates a Schnorr stub account that impersonates the one with the provided originalAddress.
 */
export function createStubSchnorrAccount(originalAddress: CompleteAddress) {
  const accountContract = new StubSchnorrAccountContract();
  const authWitnessProvider = accountContract.getAuthWitnessProvider(originalAddress);
  return new BaseAccount(
    new DefaultAccountEntrypoint(originalAddress.address, authWitnessProvider),
    authWitnessProvider,
    originalAddress,
  );
}

/**
 * Creates an ECDSA stub account that impersonates the one with the provided originalAddress.
 */
export function createStubEcdsaAccount(originalAddress: CompleteAddress) {
  const accountContract = new StubEcdsaAccountContract();
  const authWitnessProvider = accountContract.getAuthWitnessProvider(originalAddress);
  return new BaseAccount(
    new DefaultAccountEntrypoint(originalAddress.address, authWitnessProvider),
    authWitnessProvider,
    originalAddress,
  );
}

/**
 * Creates a stub account that impersonates the one with the provided originalAddress.
 * The artifact must be either {@link StubSchnorrAccountContractArtifact} or
 * {@link StubEcdsaAccountContractArtifact}; it determines which stub contract class is instantiated.
 */
export function createStubAccount(originalAddress: CompleteAddress, artifact: ContractArtifact) {
  const accountContract =
    artifact === StubSchnorrAccountContractArtifact ? new StubSchnorrAccountContract() : new StubEcdsaAccountContract();
  const authWitnessProvider = accountContract.getAuthWitnessProvider(originalAddress);
  return new BaseAccount(
    new DefaultAccountEntrypoint(originalAddress.address, authWitnessProvider),
    authWitnessProvider,
    originalAddress,
  );
}
