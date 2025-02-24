import type { AztecAddress } from '@aztec/circuits.js/aztec-address';
import { MerkleTreeId, PublicDataTreeLeaf } from '@aztec/circuits.js/trees';
import { GENESIS_ARCHIVE_ROOT, GENESIS_BLOCK_HASH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';

import { NativeWorldStateService } from './native/index.js';

async function generateGenesisValues(prefilledPublicData: PublicDataTreeLeaf[]) {
  if (!prefilledPublicData.length) {
    return {
      genesisArchiveRoot: new Fr(GENESIS_ARCHIVE_ROOT),
      genesisBlockHash: new Fr(GENESIS_BLOCK_HASH),
    };
  }

  // Create a temporary world state to compute the genesis values.
  const ws = await NativeWorldStateService.tmp(
    undefined /* rollupAddress */,
    true /* cleanupTmpDir */,
    prefilledPublicData,
  );
  const initialHeader = ws.getInitialHeader();
  const genesisBlockHash = await initialHeader.hash();
  const genesisArchiveRoot = new Fr((await ws.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);
  await ws.close();

  return {
    genesisArchiveRoot,
    genesisBlockHash,
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

  const { genesisBlockHash, genesisArchiveRoot } = await generateGenesisValues(prefilledPublicData);

  return {
    genesisArchiveRoot,
    genesisBlockHash,
    prefilledPublicData,
  };
}
