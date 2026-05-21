import { DefaultAccountContract } from '@aztec/accounts/defaults';
import type { ContractArtifact } from '@aztec/aztec.js/abi';
import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { AuthWitness } from '@aztec/aztec.js/authorization';
import type { Fr } from '@aztec/aztec.js/fields';
import { Schnorr } from '@aztec/foundation/crypto/schnorr';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { SchnorrHardcodedAccountContractArtifact } from '@aztec/noir-contracts.js/SchnorrHardcodedAccount';

/**
 * The private key that matches the hardcoded public key in the SchnorrHardcodedAccountContract.
 * The corresponding public key is baked into the Noir contract as a global constant.
 */
export const SCHNORR_HARDCODED_PRIVATE_KEY = GrumpkinScalar.fromHexString(
  '0xd35d743ac0dfe3d6dbe6be8c877cb524a00ab1e3d52d7bada095dfc8894ccfa',
);

/**
 * Account contract backed by the SchnorrHardcodedAccount Noir contract.
 * This contract verifies Schnorr signatures against a public key that is hardcoded
 * in the contract artifact (not stored in a note), so it does not require on-chain
 * deployment or initialization. Useful for tests that need a working account without
 * mining any blocks.
 */
export class SchnorrHardcodedKeyAccountContract extends DefaultAccountContract {
  constructor(private privateKey: GrumpkinScalar = SCHNORR_HARDCODED_PRIVATE_KEY) {
    super();
  }

  override getContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(SchnorrHardcodedAccountContractArtifact);
  }

  getInitializationFunctionAndArgs() {
    return Promise.resolve(undefined);
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    const privateKey = this.privateKey;
    return {
      async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        const signer = new Schnorr();
        const signature = await signer.constructSignature(messageHash, privateKey);
        return new AuthWitness(messageHash, signature.toLimbFields());
      },
    };
  }
}
