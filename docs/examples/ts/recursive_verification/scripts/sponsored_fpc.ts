// docs:start:sponsored_fpc
import { getContractInstanceFromInstantiationParams } from "@aztec-labs/aztec.js/contracts";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { SponsoredFPCContract } from "@aztec-labs/noir-contracts.js/SponsoredFPC";

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
