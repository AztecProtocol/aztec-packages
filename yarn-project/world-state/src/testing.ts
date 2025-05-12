import { GENESIS_ARCHIVE_ROOT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';

import { NativeWorldStateService } from './native/index.js';

async function generateGenesisValues(prefilledPublicData: PublicDataTreeLeaf[]) {
  if (!prefilledPublicData.length) {
    return {
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
    };
  }

  // Create a temporary world state to compute the genesis values.
  const ws = await NativeWorldStateService.tmp(
    undefined /* rollupAddress */,
    true /* cleanupTmpDir */,
    prefilledPublicData,
  );
  const genesisArchiveRoot = new Fr((await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);
  await ws.close();

  return {
    genesisArchiveRoot,
  };
}

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

  const { genesisArchiveRoot } = await generateGenesisValues(prefilledPublicData);

  return {
    genesisArchiveRoot,
    prefilledPublicData,
    fundingNeeded: BigInt(initialAccounts.length) * initialAccountFeeJuice.toBigInt(),
  };
}
