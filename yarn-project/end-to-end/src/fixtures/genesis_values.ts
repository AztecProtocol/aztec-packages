import { type AztecAddress, PublicDataTreeLeaf } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { generateGenesisValues } from '@aztec/world-state';

export const defaultInitialAccountFeeJuice = new Fr(10n ** 22n);

export async function getGenesisValues(
  initialAccounts: AztecAddress[],
  initialAccountFeeJuice = defaultInitialAccountFeeJuice,
) {
  // Top up the accounts with fee juice.
  const prefilledPublicData = initialAccounts
    .map(address => new PublicDataTreeLeaf(computeFeePayerBalanceLeafSlot(address), initialAccountFeeJuice))
    .sort((a, b) => (b.slot.lt(a.slot) ? 1 : -1));

  const { genesisBlockHash, genesisArchiveRoot } = await generateGenesisValues(prefilledPublicData);

  return {
    genesisArchiveRoot,
    genesisBlockHash,
    prefilledPublicData,
  };
}
