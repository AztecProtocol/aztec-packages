import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import { FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxSimulationResult, UtilitySimulationResult } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { Wallet } from '../wallet/wallet.js';
import { BatchCall } from './batch_call.js';

// eslint-disable-next-line jsdoc/require-jsdoc
function createUtilityExecutionPayload(
  functionName: string,
  args: Fr[],
  contractAddress: AztecAddress,
): ExecutionPayload {
  return new ExecutionPayload(
    [
      {
        name: functionName,
        to: contractAddress,
        selector: FunctionSelector.random(),
        type: FunctionType.UTILITY,
        isStatic: true,
        hideMsgSender: false,
        args,
        returnTypes: [{ kind: 'field' }],
      },
    ],
    [],
    [],
    [],
  );
}

// eslint-disable-next-line jsdoc/require-jsdoc
function createPrivateExecutionPayload(
  functionName: string,
  args: Fr[],
  contractAddress: AztecAddress,
  numReturnValues: number = 2,
): ExecutionPayload {
  return new ExecutionPayload(
    [
      {
        name: functionName,
        to: contractAddress,
        selector: FunctionSelector.random(),
        type: FunctionType.PRIVATE,
        isStatic: false,
        hideMsgSender: false,
        args,
        returnTypes: Array(numReturnValues).fill({ kind: 'field' }),
      },
    ],
    [],
    [],
    [],
  );
}

// eslint-disable-next-line jsdoc/require-jsdoc
function createPublicExecutionPayload(
  functionName: string,
  args: Fr[],
  contractAddress: AztecAddress,
): ExecutionPayload {
  return new ExecutionPayload(
    [
      {
        name: functionName,
        to: contractAddress,
        selector: FunctionSelector.random(),
        type: FunctionType.PUBLIC,
        isStatic: false,
        hideMsgSender: false,
        args,
        returnTypes: [{ kind: 'field' }],
      },
    ],
    [],
    [],
    [],
  );
}

describe('BatchCall', () => {
  let wallet: MockProxy<Wallet>;
  let batchCall: BatchCall;

  beforeEach(() => {
    wallet = mock<Wallet>();
  });

  describe('simulate with mixed interactions', () => {
    it('should batch utility calls using wallet.batch and simulate private/public calls', async () => {
      const contractAddress1 = await AztecAddress.random();
      const contractAddress2 = await AztecAddress.random();
      const contractAddress3 = await AztecAddress.random();

      // Create mock payloads: 2 utility, 1 private, 1 public
      const utilityPayload1 = createUtilityExecutionPayload('getBalance', [Fr.random()], contractAddress1);
      const privatePayload = createPrivateExecutionPayload('transfer', [Fr.random(), Fr.random()], contractAddress2);
      const utilityPayload2 = createUtilityExecutionPayload('checkPermission', [Fr.random()], contractAddress3);
      const publicPayload = createPublicExecutionPayload('mint', [Fr.random()], contractAddress1);

      batchCall = new BatchCall(wallet, [utilityPayload1, privatePayload, utilityPayload2, publicPayload]);

      // Mock utility simulation results
      const utilityResult1 = UtilitySimulationResult.random();
      const utilityResult2 = UtilitySimulationResult.random();

      wallet.batch.mockResolvedValue([
        { name: 'simulateUtility', result: utilityResult1 },
        { name: 'simulateUtility', result: utilityResult2 },
      ] as any);

      // Mock tx simulation result
      const privateReturnValues = [Fr.random(), Fr.random()];
      const publicReturnValues = [Fr.random()];

      const txSimResult = mock<TxSimulationResult>();
      txSimResult.getPrivateReturnValues.mockReturnValue({
        nested: [{ values: privateReturnValues }],
      } as any);
      txSimResult.getPublicReturnValues.mockReturnValue([{ values: publicReturnValues }] as any);
      wallet.simulateTx.mockResolvedValue(txSimResult);

      const results = await batchCall.simulate({ from: await AztecAddress.random() });

      // Verify wallet.batch was called with both utility calls
      expect(wallet.batch).toHaveBeenCalledTimes(1);
      expect(wallet.batch).toHaveBeenCalledWith([
        {
          name: 'simulateUtility',
          args: ['getBalance', expect.any(Array), contractAddress1, undefined],
        },
        {
          name: 'simulateUtility',
          args: ['checkPermission', expect.any(Array), contractAddress3, undefined],
        },
      ]);

      // Verify wallet.simulateTx was called with merged private/public calls
      expect(wallet.simulateTx).toHaveBeenCalledTimes(1);
      expect(wallet.simulateTx).toHaveBeenCalledWith(
        expect.objectContaining({
          calls: expect.arrayContaining([
            expect.objectContaining({ type: FunctionType.PRIVATE }),
            expect.objectContaining({ type: FunctionType.PUBLIC }),
          ]),
        }),
        expect.any(Object),
      );

      expect(results).toHaveLength(4);
      expect(results[0]).toBe(utilityResult1.result); // First utility
      // Results[1] will be the decoded private values (decoded from privateReturnValues)
      expect(results[1]).toEqual(privateReturnValues.map(v => v.toBigInt())); // Private call (decoded)
      expect(results[2]).toBe(utilityResult2.result); // Second utility
      // Results[3] will be the decoded public value (single value is returned directly, not as array)
      expect(results[3]).toEqual(publicReturnValues[0].toBigInt()); // Public call (decoded)
    });

    it('should handle only utility calls without calling simulateTx', async () => {
      const contractAddress1 = await AztecAddress.random();
      const contractAddress2 = await AztecAddress.random();

      const utilityPayload1 = createUtilityExecutionPayload('view1', [], contractAddress1);
      const utilityPayload2 = createUtilityExecutionPayload('view2', [], contractAddress2);

      batchCall = new BatchCall(wallet, [utilityPayload1, utilityPayload2]);

      const utilityResult1 = UtilitySimulationResult.random();
      const utilityResult2 = UtilitySimulationResult.random();

      wallet.batch.mockResolvedValue([
        { name: 'simulateUtility', result: utilityResult1 },
        { name: 'simulateUtility', result: utilityResult2 },
      ] as any);

      const results = await batchCall.simulate({ from: await AztecAddress.random() });

      expect(wallet.batch).toHaveBeenCalledTimes(1);

      // Verify wallet.simulateTx was NOT called since there are no private/public calls. This avoids empty txs.
      expect(wallet.simulateTx).not.toHaveBeenCalled();

      // Verify results
      expect(results).toHaveLength(2);
      expect(results[0]).toBe(utilityResult1.result);
      expect(results[1]).toBe(utilityResult2.result);
    });

    it('should handle only private/public calls without calling wallet.batch', async () => {
      const contractAddress1 = await AztecAddress.random();
      const contractAddress2 = await AztecAddress.random();

      const privatePayload = createPrivateExecutionPayload('privateFunc', [Fr.random()], contractAddress1, 1);
      const publicPayload = createPublicExecutionPayload('publicFunc', [Fr.random()], contractAddress2);

      batchCall = new BatchCall(wallet, [privatePayload, publicPayload]);

      const privateReturnValues = [Fr.random()];
      const publicReturnValues = [Fr.random()];

      const txSimResult = mock<TxSimulationResult>();
      txSimResult.getPrivateReturnValues.mockReturnValue({
        nested: [{ values: privateReturnValues }],
      } as any);
      txSimResult.getPublicReturnValues.mockReturnValue([{ values: publicReturnValues }] as any);
      wallet.simulateTx.mockResolvedValue(txSimResult);

      const results = await batchCall.simulate({ from: await AztecAddress.random() });

      // Verify wallet.batch was NOT called since there are no utility calls
      expect(wallet.batch).not.toHaveBeenCalled();

      expect(wallet.simulateTx).toHaveBeenCalledTimes(1);

      // Verify results (decoded)
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(privateReturnValues[0].toBigInt()); // Single value returned directly
      expect(results[1]).toEqual(publicReturnValues[0].toBigInt()); // Single value returned directly
    });

    it('should handle empty batch', async () => {
      batchCall = new BatchCall(wallet, []);

      const results = await batchCall.simulate({ from: await AztecAddress.random() });

      expect(wallet.batch).not.toHaveBeenCalled();
      expect(wallet.simulateTx).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });

  describe('request', () => {
    it('should include fee payment method if provided', async () => {
      const contractAddress = await AztecAddress.random();
      const payload = createPrivateExecutionPayload('func', [Fr.random()], contractAddress);

      batchCall = new BatchCall(wallet, [payload]);

      const feePayload = createPrivateExecutionPayload('payFee', [Fr.random()], await AztecAddress.random());
      // eslint-disable-next-line jsdoc/require-jsdoc
      const mockPaymentMethod = mock<{ getExecutionPayload: () => Promise<ExecutionPayload> }>();
      mockPaymentMethod.getExecutionPayload.mockResolvedValue(feePayload);

      const result = await batchCall.request({
        fee: { paymentMethod: mockPaymentMethod as any },
      });

      // Should have fee payment call first, then the actual call
      expect(result.calls).toHaveLength(2);
      expect(result.calls[0]).toEqual(feePayload.calls[0]);
      expect(result.calls[1]).toEqual(payload.calls[0]);
      expect(mockPaymentMethod.getExecutionPayload).toHaveBeenCalledTimes(1);
    });
  });
});
