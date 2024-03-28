import {
  Fr,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PublicDataUpdateRequest,
  SideEffect,
  SideEffectLinkedToNoteHash,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';

import { MIN_DA_GAS_USED, getDAGasUsed } from './get_da_gas_used.js';

describe('get_da_gas_used', () => {
  it('correctly calculates DA gas for empty TxEffect', () => {
    const gasUsed = getDAGasUsed({
      noteHashes: makeTuple(MAX_NEW_NOTE_HASHES_PER_TX, SideEffect.empty),
      nullifiers: makeTuple(MAX_NEW_NULLIFIERS_PER_TX, SideEffectLinkedToNoteHash.empty),
      l2ToL1Msgs: makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_TX, Fr.zero),
      publicDataUpdateRequests: makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataUpdateRequest.empty),
      encryptedLogPreimagesLength: 4, // 4 bytes for storing the length of the empty logs
      unencryptedLogPreimagesLength: 4, // 4 bytes for storing the length of the empty logs
    });

    expect(gasUsed).toEqual(MIN_DA_GAS_USED);
  });

  // TODO(@just-mitch) more tests please
});
