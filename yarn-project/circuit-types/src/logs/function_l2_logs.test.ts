import { jsonStringify } from '@aztec/foundation/json-rpc';

import { UnencryptedFunctionL2Logs } from './function_l2_logs.js';

function shouldBehaveLikeFunctionL2Logs(FunctionL2Logs: typeof UnencryptedFunctionL2Logs) {
  describe(FunctionL2Logs.name, () => {
    it('can encode L2Logs to buffer and back', async () => {
      const l2Logs = await FunctionL2Logs.random(1);

      const buffer = l2Logs.toBuffer();
      const recovered = FunctionL2Logs.fromBuffer(buffer);

      expect(recovered).toEqual(l2Logs);
    });

    it('can encode L2Logs to JSON and back', async () => {
      const l2Logs = await FunctionL2Logs.random(1);

      const buffer = jsonStringify(l2Logs);
      const recovered = FunctionL2Logs.schema.parse(JSON.parse(buffer));

      expect(recovered).toEqual(l2Logs);
    });

    it('getSerializedLength returns the correct length', async () => {
      const l2Logs = await FunctionL2Logs.random(1);

      const buffer = l2Logs.toBuffer();
      const recovered = FunctionL2Logs.fromBuffer(buffer);
      if (FunctionL2Logs.name == 'EncryptedFunctionL2Logs') {
        // For event logs, we don't 'count' the maskedContractAddress as part of the
        // log length, since it's just for siloing later on
        expect(recovered.getSerializedLength()).toEqual(buffer.length - 3 * 32);
      } else {
        expect(recovered.getSerializedLength()).toEqual(buffer.length);
      }
    });

    it('getKernelLength returns the correct length', async () => {
      const l2Logs = await FunctionL2Logs.random(1);

      const expectedLength = l2Logs.logs.map(l => l.length).reduce((a, b) => a + b + 4, 0);

      expect(l2Logs.getKernelLength()).toEqual(expectedLength);
    });
  });
}

shouldBehaveLikeFunctionL2Logs(UnencryptedFunctionL2Logs);
