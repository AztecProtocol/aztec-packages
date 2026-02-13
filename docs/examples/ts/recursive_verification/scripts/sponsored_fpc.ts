// docs:start:sponsored_fpc
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { Fr } from "@aztec/aztec.js/fields";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";

const SPONSORED_FPC_SALT = new Fr(BigInt(0));

export async function getSponsoredFPCInstance() {
  return await getContractInstanceFromInstantiationParams(
    SponsoredFPCContract.artifact,
    {
      salt: SPONSORED_FPC_SALT,
    },
  );
}
// docs:end:sponsored_fpc
