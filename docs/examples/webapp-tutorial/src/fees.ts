import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import type { PXE } from '@aztec/pxe/server';

// docs:start:get-sponsored-fpc
/**
 * Returns the SponsoredFPC contract details.
 * The SponsoredFPC (Fee Payment Contract) pays transaction fees on behalf of users.
 * This is deployed at a well-known address derived from a fixed salt.
 */
export async function getSponsoredFPCContract() {
  const { SponsoredFPCContractArtifact } = await import(
    '@aztec/noir-contracts.js/SponsoredFPC'
  );
  const instance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) }
  );
  return { instance, artifact: SponsoredFPCContractArtifact };
}
// docs:end:get-sponsored-fpc

// docs:start:register-fpc
/**
 * Registers the SponsoredFPC contract with PXE so it can be used for fee payment.
 * This must be called before sending any transactions.
 */
export async function registerSponsoredFPC(pxe: PXE) {
  const contract = await getSponsoredFPCContract();
  await pxe.registerContractClass(contract.artifact);
  await pxe.registerContract(contract.instance);
  return contract.instance.address;
}
// docs:end:register-fpc

// docs:start:create-fee-payment
/**
 * Creates a SponsoredFeePaymentMethod that can be passed as the
 * `paymentMethod` option when sending transactions.
 */
export async function createSponsoredFeePayment() {
  const contract = await getSponsoredFPCContract();
  return new SponsoredFeePaymentMethod(contract.instance.address);
}
// docs:end:create-fee-payment
