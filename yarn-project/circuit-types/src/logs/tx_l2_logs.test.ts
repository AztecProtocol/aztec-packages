import { jsonStringify } from '@aztec/foundation/json-rpc';

import { ContractClassTxL2Logs, EncryptedNoteTxL2Logs, EncryptedTxL2Logs, UnencryptedTxL2Logs } from './tx_l2_logs.js';

function shouldBehaveLikeTxL2Logs(
  TxL2Logs:
    | typeof EncryptedNoteTxL2Logs
    | typeof UnencryptedTxL2Logs
    | typeof EncryptedTxL2Logs
    | typeof ContractClassTxL2Logs,
) {
  describe(TxL2Logs.name, () => {
    it('can encode TxL2Logs to buffer and back', () => {
      const l2Logs = TxL2Logs.name == 'ContractClassTxL2Logs' ? TxL2Logs.random(1, 1) : TxL2Logs.random(4, 2);

      const buffer = l2Logs.toBuffer();
      const recovered = TxL2Logs.fromBuffer(buffer);

      expect(recovered).toEqual(l2Logs);
    });

    it('can encode TxL2Logs to JSON and back', () => {
      const l2Logs = TxL2Logs.name == 'ContractClassTxL2Logs' ? TxL2Logs.random(1, 1) : TxL2Logs.random(4, 2);

      const buffer = jsonStringify(l2Logs);
      const recovered = TxL2Logs.schema.parse(JSON.parse(buffer));

      expect(recovered).toEqual(l2Logs);
    });

    it('getSerializedLength returns the correct length', () => {
      const l2Logs = TxL2Logs.name == 'ContractClassTxL2Logs' ? TxL2Logs.random(1, 1) : TxL2Logs.random(4, 2);

      const buffer = l2Logs.toBuffer();
      const recovered = TxL2Logs.fromBuffer(buffer);
      if (TxL2Logs.name == 'EncryptedTxL2Logs') {
        // For event logs, we don't 'count' the maskedContractAddress as part of the
        // log length, since it's just for siloing later on
        expect(recovered.getSerializedLength()).toEqual(buffer.length - 8 * 32);
      } else {
        expect(recovered.getSerializedLength()).toEqual(buffer.length);
      }
    });

    it('getKernelLength returns the correct length', () => {
      const l2Logs = TxL2Logs.name == 'ContractClassTxL2Logs' ? TxL2Logs.random(1, 1) : TxL2Logs.random(4, 2);

      const expectedLength = l2Logs.functionLogs.map(l => l.getKernelLength()).reduce((a, b) => a + b, 0);

      expect(l2Logs.getKernelLength()).toEqual(expectedLength);
    });
  });
}

shouldBehaveLikeTxL2Logs(EncryptedNoteTxL2Logs);
shouldBehaveLikeTxL2Logs(UnencryptedTxL2Logs);
shouldBehaveLikeTxL2Logs(EncryptedTxL2Logs);
shouldBehaveLikeTxL2Logs(ContractClassTxL2Logs);
