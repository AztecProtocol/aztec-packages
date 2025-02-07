import { type AztecAddress, PublicDataTreeLeaf } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { generateGenesisValues } from '@aztec/world-state';

export const defaultInitialAccountFeeJuice = new Fr(10n ** 22n);

export async function getGenesisValues(
  initialAccounts: AztecAddress[],
  initialAccountFeeJuice = defaultInitialAccountFeeJuice,
  genesisPublicData: PublicDataTreeLeaf[] = [],
) {
  // Top up the accounts with fee juice.
  let prefilledPublicData = await Promise.all(
    initialAccounts.map(
      async address => new PublicDataTreeLeaf(await computeFeePayerBalanceLeafSlot(address), initialAccountFeeJuice),
    ),
  );

  // Add user-defined public data
  prefilledPublicData = prefilledPublicData.concat(genesisPublicData);

  prefilledPublicData.sort((a, b) => (b.slot.lt(a.slot) ? 1 : -1));

  const { genesisBlockHash, genesisArchiveRoot } = await generateGenesisValues(prefilledPublicData);

  return {
    genesisArchiveRoot,
    genesisBlockHash,
    prefilledPublicData,
  };
}
