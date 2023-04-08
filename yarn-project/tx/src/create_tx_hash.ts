import { serializeToBuffer } from '@aztec/circuits.js/utils';
import { AztecAddress, EthAddress, Fr, keccak } from '@aztec/foundation';
import { TxHash } from './tx_hash.js';

export interface TxDataToHash {
  newCommitments: Fr[];
  newNullifiers: Fr[];
  newContracts: {
    contractAddress: AztecAddress;
    portalContractAddress: EthAddress;
  }[];
}

/**
 * Utility function to generate tx hash.
 * @param tx - The transaction from which to generate the hash.
 * @returns A hash of the tx data that identifies the tx.
 */
export function createTxHash(tx: TxDataToHash): TxHash {
  const data = Buffer.concat(
    [
      tx.newCommitments.map(x => x.toBuffer()),
      tx.newNullifiers.map(x => x.toBuffer()),
      tx.newContracts.map(x => serializeToBuffer(x.contractAddress, x.portalContractAddress)),
    ].flat(),
  );
  return new TxHash(keccak(data));
}
