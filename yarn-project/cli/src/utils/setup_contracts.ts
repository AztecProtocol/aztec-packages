import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { SPONSORED_FPC_SALT } from '@aztec/constants';

async function getSponsoredFPCContract() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { SponsoredFPCContract } = await import('@aztec/noir-contracts.js/SponsoredFPC');
  return SponsoredFPCContract;
}

export async function getSponsoredFPCAddress(): Promise<AztecAddress> {
  const SponsoredFPCContract = await getSponsoredFPCContract();
  const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  });
  return sponsoredFPCInstance.address;
}
