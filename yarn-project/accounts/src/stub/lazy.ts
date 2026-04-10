import { BaseAccount } from '@aztec/aztec.js/account';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { DefaultAccountEntrypoint } from '@aztec/entrypoints/account';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { loadContractArtifact } from '@aztec/stdlib/abi';

import { StubBaseAccountContract } from './account_contract.js';

/**
 * Lazily loads the Schnorr stub contract artifact (browser-compatible).
 */
export async function getStubSchnorrAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with bundlers like vite
  // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
  const { default: json } = await import('../../artifacts/SimulatedSchnorrAccount.json');
  return loadContractArtifact(json);
}

/**
 * Lazily loads the ECDSA stub contract artifact (browser-compatible).
 */
export async function getStubEcdsaAccountContractArtifact() {
  // Cannot assert this import as it's incompatible with bundlers like vite
  // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
  const { default: json } = await import('../../artifacts/SimulatedEcdsaAccount.json');
  return loadContractArtifact(json);
}

export class StubSchnorrAccountContract extends StubBaseAccountContract {
  override getContractArtifact(): Promise<ContractArtifact> {
    return getStubSchnorrAccountContractArtifact();
  }
}

export class StubEcdsaAccountContract extends StubBaseAccountContract {
  override getContractArtifact(): Promise<ContractArtifact> {
    return getStubEcdsaAccountContractArtifact();
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
 * The artifact must be either the Schnorr or ECDSA stub artifact returned by the
 * corresponding getter above; it determines which stub contract class is instantiated.
 */
export function createStubAccount(originalAddress: CompleteAddress, artifact: ContractArtifact) {
  const accountContract =
    artifact.name === 'SimulatedSchnorrAccount' ? new StubSchnorrAccountContract() : new StubEcdsaAccountContract();
  const authWitnessProvider = accountContract.getAuthWitnessProvider(originalAddress);
  return new BaseAccount(
    new DefaultAccountEntrypoint(originalAddress.address, authWitnessProvider),
    authWitnessProvider,
    originalAddress,
  );
}
