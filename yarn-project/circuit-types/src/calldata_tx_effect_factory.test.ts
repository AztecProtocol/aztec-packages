import {
  Fr,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  RevertCode,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';

import { CalldataTxEffectFactory, DA_BYTE_GAS, FIXED_DA_GAS, TxL2Logs } from './index.js';
import { PublicDataWrite } from './public_data_write.js';
import { ITxEffectWithoutGasUsed } from './tx_effect.js';

describe('calldata_tx_effect_factory', () => {
  it('correctly calculates DA gas for empty TxEffect', () => {
    const effect: ITxEffectWithoutGasUsed = {
      revertCode: RevertCode.OK,
      noteHashes: makeTuple(MAX_NEW_NOTE_HASHES_PER_TX, Fr.zero),
      nullifiers: makeTuple(MAX_NEW_NULLIFIERS_PER_TX, Fr.zero),
      l2ToL1Msgs: makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_TX, Fr.zero),
      publicDataWrites: makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.empty),
      encryptedLogs: TxL2Logs.empty(),
      unencryptedLogs: TxL2Logs.empty(),
    };

    const gasUsed = CalldataTxEffectFactory.build(effect).daGasUsed;

    // 4n for each log, due to encoding of the length of the logs
    expect(gasUsed.value).toEqual(FIXED_DA_GAS + 4n * DA_BYTE_GAS + 4n * DA_BYTE_GAS);
  });

  // TODO(@just-mitch) more tests please
});
