import {
  CircuitsWasm,
  CombinedHistoricTreeRoots,
  Fr,
  GlobalVariables,
  PrivateHistoricTreeRoots,
} from '@aztec/circuits.js';
import { computeGlobalsHash } from '@aztec/circuits.js/abis';
import { MerkleTreeId } from '@aztec/types';
import { MerkleTreeOperations } from '@aztec/world-state';

/**
 * Fetches the private, nullifier, contract tree and l1 to l2 messages tree roots from a given db and assembles a CombinedHistoricTreeRoots object.
 */
export async function getCombinedHistoricTreeRoots(
  db: MerkleTreeOperations,
  prevBlockGlobalVariables: GlobalVariables = GlobalVariables.empty(),
) {
  const wasm = await CircuitsWasm.get();
  const prevGlobalsHash = computeGlobalsHash(wasm, prevBlockGlobalVariables);

  return new CombinedHistoricTreeRoots(
    new PrivateHistoricTreeRoots(
      Fr.fromBuffer((await db.getTreeInfo(MerkleTreeId.PRIVATE_DATA_TREE)).root),
      Fr.fromBuffer((await db.getTreeInfo(MerkleTreeId.NULLIFIER_TREE)).root),
      Fr.fromBuffer((await db.getTreeInfo(MerkleTreeId.CONTRACT_TREE)).root),
      Fr.fromBuffer((await db.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGES_TREE)).root),
      Fr.fromBuffer((await db.getTreeInfo(MerkleTreeId.BLOCKS_TREE)).root),
      Fr.ZERO,
    ),
    Fr.fromBuffer((await db.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE)).root),
    prevGlobalsHash,
  );
}
