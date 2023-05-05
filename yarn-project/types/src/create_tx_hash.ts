import { Fr } from '@aztec/foundation/fields';
import { TxHash } from './tx_hash.js';
import { keccak224 } from '@aztec/foundation/crypto';
import { CircuitsWasm, CombinedAccumulatedData } from '@aztec/circuits.js';
import { computeContractLeaf } from '@aztec/circuits.js/abis';

/**
 * Defines transaction data.
 */
interface TxData {
  /**
   * Commitments to be inserted into a private data tree that are created in the transaction.
   */
  newCommitments: Fr[];
  /**
   * Nullifiers to be inserted into a nullifier tree that are created in the transaction.
   */
  newNullifiers: Fr[];
  /**
   * Contractc leaves to be inserted into a contract tree that are created in the transaction.
   */
  newContracts: Fr[];
}

/**
 * Utility function to generate tx hash.
 * @param txData - The data from which to generate the hash.
 * @returns A hash of the tx data that identifies the tx.
 */
export function createTxHash({ newCommitments, newNullifiers, newContracts }: TxData) {
  // TODO: This will not calculate the correct hash when public function calls are involved
  // See https://github.com/AztecProtocol/aztec3-packages/issues/361
  const data = Buffer.concat(
    [
      newCommitments.map(x => x.toBuffer()),
      newNullifiers.map(x => x.toBuffer()),
      newContracts.map(x => x.toBuffer()),
    ].flat(),
  );
  return new TxHash(keccak224(data));
}

/**
 * Utility function to generate the hash of an 'empty' tx
 * @returns A hash of the 'empty' tx data
 */
export function createEmptyTxHash(wasm: CircuitsWasm) {
  const accumulatedData = CombinedAccumulatedData.empty();
  return createTxHash({
    ...accumulatedData,
    newContracts: accumulatedData.newContracts.map(cd => computeContractLeaf(wasm, cd)),
  });
}
