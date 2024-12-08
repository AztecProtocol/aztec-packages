import { jsonStringify } from '@aztec/foundation/json-rpc';

import { ContractClassTxL2Logs, UnencryptedTxL2Logs } from './tx_l2_logs.js';

function shouldBehaveLikeTxL2Logs(TxL2Logs: typeof UnencryptedTxL2Logs | typeof ContractClassTxL2Logs) {
  describe(TxL2Logs.name, () => {
    it('can encode TxL2Logs to buffer and back', async () => {
      const l2Logs =
        TxL2Logs.name == 'ContractClassTxL2Logs' ? await TxL2Logs.random(1, 1) : await TxL2Logs.random(4, 2);

      const buffer = l2Logs.toBuffer();
      const recovered = TxL2Logs.fromBuffer(buffer);

      expect(recovered).toEqual(l2Logs);
    });

    it('can encode TxL2Logs to JSON and back', async () => {
      const l2Logs =
        TxL2Logs.name == 'ContractClassTxL2Logs' ? await TxL2Logs.random(1, 1) : await TxL2Logs.random(4, 2);

      const buffer = jsonStringify(l2Logs);
      const recovered = TxL2Logs.schema.parse(JSON.parse(buffer));

      expect(recovered).toEqual(l2Logs);
    });

    it('getSerializedLength returns the correct length', async () => {
      const l2Logs =
        TxL2Logs.name == 'ContractClassTxL2Logs' ? await TxL2Logs.random(1, 1) : await TxL2Logs.random(4, 2);

      const buffer = l2Logs.toBuffer();
      const recovered = TxL2Logs.fromBuffer(buffer);
      expect(recovered.getSerializedLength()).toEqual(buffer.length);
    });

    it('getKernelLength returns the correct length', async () => {
      const l2Logs =
        TxL2Logs.name == 'ContractClassTxL2Logs' ? await TxL2Logs.random(1, 1) : await TxL2Logs.random(4, 2);

      const expectedLength = l2Logs.functionLogs.map(l => l.getKernelLength()).reduce((a, b) => a + b, 0);

      expect(l2Logs.getKernelLength()).toEqual(expectedLength);
    });
  });
}

shouldBehaveLikeTxL2Logs(UnencryptedTxL2Logs);
shouldBehaveLikeTxL2Logs(ContractClassTxL2Logs);
