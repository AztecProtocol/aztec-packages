import { MerkleTreeId } from '@aztec/circuit-types';
import { Fr, GENESIS_ARCHIVE_ROOT, GENESIS_BLOCK_HASH, type PublicDataTreeLeaf } from '@aztec/circuits.js';

import { NativeWorldStateService } from './native/index.js';

export async function generateGenesisValues(prefilledPublicData: PublicDataTreeLeaf[]) {
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
