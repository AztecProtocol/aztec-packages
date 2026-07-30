import { Fr } from '@aztec/foundation/curves/bn254';
import { type AbiType, FunctionCall, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  Capsule,
  ExecutionPayload,
  HashedValues,
  NestedProcessReturnValues,
  OFFCHAIN_MESSAGE_IDENTIFIER,
  type OffchainEffect,
  UtilityExecutionResult,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { FeePaymentMethod } from '../fee/fee_payment_method.js';
import { TxSimulationResultWithAppOffset } from '../wallet/tx_simulation_result_with_app_offset.js';
import type { Wallet } from '../wallet/wallet.js';
import { BatchCall } from './batch_call.js';

function mockTxSimResult(overrides: { anchorBlockTimestamp?: bigint; offchainEffects?: OffchainEffect[] } = {}) {
  const txSimResult = mock<TxSimulationResultWithAppOffset>();
  Object.defineProperty(txSimResult, 'offchainEffects', { value: overrides.offchainEffects ?? [] });
  Object.defineProperty(txSimResult, 'publicInputs', {
    value: {
      constants: {
        anchorBlockHeader: { globalVariables: { timestamp: overrides.anchorBlockTimestamp ?? 0n } },
      },
    },
  });
  return txSimResult;
}

const ONE_FIELD: AbiType = { kind: 'field' };
const TWO_FIELDS: AbiType = { kind: 'tuple', fields: [{ kind: 'field' }, { kind: 'field' }] };

function createUtilityExecutionPayload(
  functionName: string,
  args: Fr[],
  contractAddress: AztecAddress,
): ExecutionPayload {
  return new ExecutionPayload(
    [
      FunctionCall.from({
        name: functionName,
        to: contractAddress,
        selector: FunctionSelector.random(),
        type: FunctionType.UTILITY,
        hideMsgSender: false,
        isStatic: true,
        args,
        returnType: ONE_FIELD,
      }),
    ],
    [],
    [],
    [],
    undefined,
  );
}

function createPrivateExecutionPayload(
  functionName: string,
  args: Fr[],
  contractAddress: AztecAddress,
  returnType: AbiType = TWO_FIELDS,
): ExecutionPayload {
  return new ExecutionPayload(
    [
      FunctionCall.from({
        name: functionName,
        to: contractAddress,
        selector: FunctionSelector.random(),
        type: FunctionType.PRIVATE,
        hideMsgSender: false,
        isStatic: false,
        args,
        returnType,
      }),
    ],
    [],
    [],
    [],
    undefined,
  );
}

function createPublicExecutionPayload(
  functionName: string,
  args: Fr[],
  contractAddress: AztecAddress,
): ExecutionPayload {
  return new ExecutionPayload(
    [
      FunctionCall.from({
        name: functionName,
        to: contractAddress,
        selector: FunctionSelector.random(),
        type: FunctionType.PUBLIC,
        hideMsgSender: false,
        isStatic: false,
        args,
        returnType: ONE_FIELD,
      }),
    ],
    [],
    [],
    [],
    undefined,
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
      const utilityResult1 = UtilityExecutionResult.random();
      const utilityResult2 = UtilityExecutionResult.random();

      // Mock tx simulation result
      const privateReturnValues = [Fr.random(), Fr.random()];
      const publicReturnValues = [Fr.random()];

      const txSimResult = mockTxSimResult();
      txSimResult.getPrivateReturnValuesOfAppCall.mockReturnValue({ values: privateReturnValues } as any);
      txSimResult.getPublicReturnValues.mockReturnValue([{ values: publicReturnValues }] as any);

      // Mock wallet.batch to return both utility results and simulateTx result
      wallet.batch.mockResolvedValue([
        { name: 'executeUtility', result: utilityResult1 },
        { name: 'executeUtility', result: utilityResult2 },
        { name: 'simulateTx', result: txSimResult },
      ] as any);

      const { result: results } = await batchCall.simulate({ from: await AztecAddress.random() });

      // Verify wallet.batch was called once with both utility calls AND simulateTx
      expect(wallet.batch).toHaveBeenCalledTimes(1);
      expect(wallet.batch).toHaveBeenCalledWith([
        {
          name: 'executeUtility',
          args: [
            expect.objectContaining({ name: 'getBalance', to: contractAddress1 }),
            expect.objectContaining({ scopes: expect.any(Array) }),
          ],
        },
        {
          name: 'executeUtility',
          args: [
            expect.objectContaining({ name: 'checkPermission', to: contractAddress3 }),
            expect.objectContaining({ scopes: expect.any(Array) }),
          ],
        },
        {
          name: 'simulateTx',
          args: [
            expect.objectContaining({
              calls: expect.arrayContaining([
                expect.objectContaining({ type: FunctionType.PRIVATE }),
                expect.objectContaining({ type: FunctionType.PUBLIC }),
              ]),
            }),
            expect.any(Object),
          ],
        },
      ]);

      // Verify wallet.simulateTx/executeUtility were NOT called directly
      expect(wallet.simulateTx).not.toHaveBeenCalled();
      expect(wallet.executeUtility).not.toHaveBeenCalled();

      expect(results).toHaveLength(4);
      // First utility - decoded from Fr[] to bigint (single field returns the value directly, not as array)
      expect(results[0].result).toEqual(utilityResult1.result[0].toBigInt());
      // Results[1] will be the decoded private values (decoded from privateReturnValues)
      expect(results[1].result).toEqual(privateReturnValues.map(v => v.toBigInt())); // Private call (decoded)
      // Second utility - decoded from Fr[] to bigint
      expect(results[2].result).toEqual(utilityResult2.result[0].toBigInt());
      // Results[3] will be the decoded public value (single value is returned directly, not as array)
      expect(results[3].result).toEqual(publicReturnValues[0].toBigInt()); // Public call (decoded)
    });

    it('should handle only utility calls without calling simulateTx', async () => {
      const contractAddress1 = await AztecAddress.random();
      const contractAddress2 = await AztecAddress.random();

      const utilityPayload1 = createUtilityExecutionPayload('view1', [], contractAddress1);
      const utilityPayload2 = createUtilityExecutionPayload('view2', [], contractAddress2);

      batchCall = new BatchCall(wallet, [utilityPayload1, utilityPayload2]);

      // Mock utility execution results
      const utilityResult1 = UtilityExecutionResult.random();
      const utilityResult2 = UtilityExecutionResult.random();

      wallet.batch.mockResolvedValue([
        { name: 'executeUtility', result: utilityResult1 },
        { name: 'executeUtility', result: utilityResult2 },
      ] as any);

      const { result: results } = await batchCall.simulate({ from: await AztecAddress.random() });

      expect(wallet.batch).toHaveBeenCalledTimes(1);
      expect(wallet.batch).toHaveBeenCalledWith([
        {
          name: 'executeUtility',
          args: [
            expect.objectContaining({ name: 'view1', to: contractAddress1 }),
            expect.objectContaining({ scopes: expect.any(Array) }),
          ],
        },
        {
          name: 'executeUtility',
          args: [
            expect.objectContaining({ name: 'view2', to: contractAddress2 }),
            expect.objectContaining({ scopes: expect.any(Array) }),
          ],
        },
      ]);

      // Verify results - decoded from Fr[] to bigint
      expect(results).toHaveLength(2);
      expect(results[0].result).toEqual(utilityResult1.result[0].toBigInt());
      expect(results[1].result).toEqual(utilityResult2.result[0].toBigInt());
    });

    it('should include empty offchainEffects and offchainMessages in utility call results', async () => {
      const contractAddress = await AztecAddress.random();
      const utilityPayload = createUtilityExecutionPayload('view', [], contractAddress);

      batchCall = new BatchCall(wallet, [utilityPayload]);

      const utilityResult = UtilityExecutionResult.random();
      wallet.batch.mockResolvedValue([{ name: 'executeUtility', result: utilityResult }] as any);

      const { result: results } = await batchCall.simulate({ from: await AztecAddress.random() });

      expect(results).toHaveLength(1);
      expect(results[0].offchainEffects).toEqual([]);
      expect(results[0].offchainMessages).toEqual([]);
    });

    // This is not a great test, mostly because it is very synthetic, mocking too much stuff around. I wanted something
    // that exercised the offchain effects processing side of things in the case of batches, and this is more or less
    // what matches how things are done in this suite, but the fact that we need to resort to mocking so much seems
    // like a smell. We should revisit when we have more time to rethink the suite.
    it('should extract offchain messages with anchor block timestamp from mixed batch', async () => {
      const emitterContract = await AztecAddress.random();
      const anchorBlockTimestamp = 1234567890n;

      const utilityRecipient = await AztecAddress.random();
      const utilityMsgPayload = [Fr.random(), Fr.random()];
      const utilityRawEffectData = [Fr.random(), Fr.random()];

      const txRecipient = await AztecAddress.random();
      const txMsgPayload = [Fr.random(), Fr.random()];
      const txRawEffectData = [Fr.random(), Fr.random()];

      batchCall = new BatchCall(wallet, [
        createUtilityExecutionPayload('getBalance', [Fr.random()], emitterContract),
        createPrivateExecutionPayload('transfer', [Fr.random()], emitterContract, ONE_FIELD),
        createPrivateExecutionPayload('transfer', [Fr.random()], emitterContract, ONE_FIELD),
      ]);

      const utilityResult = new UtilityExecutionResult(
        [Fr.random()],
        [
          {
            data: [OFFCHAIN_MESSAGE_IDENTIFIER, utilityRecipient.toField(), ...utilityMsgPayload],
            contractAddress: emitterContract,
          },
          { data: utilityRawEffectData, contractAddress: emitterContract },
        ],
        anchorBlockTimestamp,
      );

      const txSimResult = mockTxSimResult({
        anchorBlockTimestamp,
        offchainEffects: [
          {
            data: [OFFCHAIN_MESSAGE_IDENTIFIER, txRecipient.toField(), ...txMsgPayload],
            contractAddress: emitterContract,
          },
          { data: txRawEffectData, contractAddress: emitterContract },
        ],
      });
      txSimResult.getPrivateReturnValuesOfAppCall.mockImplementation(
        () => new NestedProcessReturnValues([Fr.random()]),
      );

      wallet.batch.mockResolvedValue([
        { name: 'executeUtility', result: utilityResult },
        { name: 'simulateTx', result: txSimResult },
      ] as any);

      const { result: results } = await batchCall.simulate({ from: await AztecAddress.random() });
      expect(results).toHaveLength(3);

      expect(results[0].offchainMessages).toEqual([
        {
          recipient: utilityRecipient,
          payload: utilityMsgPayload,
          contractAddress: emitterContract,
          anchorBlockTimestamp,
        },
      ]);
      expect(results[0].offchainEffects).toEqual([{ data: utilityRawEffectData, contractAddress: emitterContract }]);

      // Both private results share the single tx-level offchain output
      for (const idx of [1, 2]) {
        expect(results[idx].offchainMessages).toEqual([
          { recipient: txRecipient, payload: txMsgPayload, contractAddress: emitterContract, anchorBlockTimestamp },
        ]);
        expect(results[idx].offchainEffects).toEqual([{ data: txRawEffectData, contractAddress: emitterContract }]);
      }
    });

    it('should handle only private/public calls using wallet.batch with simulateTx', async () => {
      const contractAddress1 = await AztecAddress.random();
      const contractAddress2 = await AztecAddress.random();

      const privatePayload = createPrivateExecutionPayload('privateFunc', [Fr.random()], contractAddress1, ONE_FIELD);
      const publicPayload = createPublicExecutionPayload('publicFunc', [Fr.random()], contractAddress2);

      batchCall = new BatchCall(wallet, [privatePayload, publicPayload]);

      const privateReturnValues = [Fr.random()];
      const publicReturnValues = [Fr.random()];

      const txSimResult = mockTxSimResult();
      txSimResult.getPrivateReturnValuesOfAppCall.mockReturnValue({ values: privateReturnValues } as any);
      txSimResult.getPublicReturnValues.mockReturnValue([{ values: publicReturnValues }] as any);

      wallet.batch.mockResolvedValue([{ name: 'simulateTx', result: txSimResult }] as any);

      const { result: results } = await batchCall.simulate({ from: await AztecAddress.random() });

      expect(wallet.batch).toHaveBeenCalledTimes(1);
      expect(wallet.batch).toHaveBeenCalledWith([
        {
          name: 'simulateTx',
          args: [
            expect.objectContaining({
              calls: expect.arrayContaining([
                expect.objectContaining({ type: FunctionType.PRIVATE }),
                expect.objectContaining({ type: FunctionType.PUBLIC }),
              ]),
            }),
            expect.any(Object),
          ],
        },
      ]);

      // Verify results (decoded)
      expect(results).toHaveLength(2);
      expect(results[0].result).toEqual(privateReturnValues[0].toBigInt()); // Single value returned directly
      expect(results[1].result).toEqual(publicReturnValues[0].toBigInt()); // Single value returned directly
    });

    it('should handle empty batch', async () => {
      batchCall = new BatchCall(wallet, []);

      const { result: results } = await batchCall.simulate({ from: await AztecAddress.random() });

      expect(wallet.batch).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });

  describe('simulate with fee payment method', () => {
    it('offsets return-value indices by the calls the fee payment method prepends', async () => {
      const appContract = await AztecAddress.random();
      const feeContract = await AztecAddress.random();

      const appPrivatePayload = createPrivateExecutionPayload('appPrivate', [Fr.random()], appContract, 1);
      const appPublicPayload = createPublicExecutionPayload('appPublic', [Fr.random()], appContract);

      batchCall = new BatchCall(wallet, [appPrivatePayload, appPublicPayload]);

      // The fee method contributes one private and one public call, prepended ahead of the batch.
      const feePrivateCall = createPrivateExecutionPayload('feePrivate', [], feeContract).calls[0];
      const feePublicCall = createPublicExecutionPayload('feePublic', [], feeContract).calls[0];
      const feePayload = new ExecutionPayload([feePrivateCall, feePublicCall], [], [], [], await AztecAddress.random());

      const paymentMethod = mock<FeePaymentMethod>();
      paymentMethod.getExecutionPayload.mockResolvedValue(feePayload);

      const appPrivateReturnValues = [Fr.random()];
      const appPublicReturnValues = [Fr.random()];

      const txSimResult = mockTxSimResult();
      // Private nested index 0 is the fee call, index 1 is the app call. Returning distinct values lets us detect
      // an off-by-one that would decode the fee call's return values as the app call's.
      txSimResult.getPrivateReturnValuesOfAppCall.mockImplementation(
        (idx?: number) => (idx === 1 ? { values: appPrivateReturnValues } : { values: [Fr.random()] }) as any,
      );
      // Public index 0 is the fee call, index 1 is the app call.
      txSimResult.getPublicReturnValues.mockReturnValue([
        { values: [Fr.random()] },
        { values: appPublicReturnValues },
      ] as any);

      wallet.batch.mockResolvedValue([{ name: 'simulateTx', result: txSimResult }] as any);

      const { result: results } = await batchCall.simulate({
        from: await AztecAddress.random(),
        fee: { paymentMethod },
      });

      expect(txSimResult.getPrivateReturnValuesOfAppCall).toHaveBeenCalledWith(1);
      expect(results).toHaveLength(2);
      expect(results[0].result).toEqual(appPrivateReturnValues[0].toBigInt());
      expect(results[1].result).toEqual(appPublicReturnValues[0].toBigInt());
    });

    it('merges the fee payment method payload and preserves its fee payer', async () => {
      const appContract = await AztecAddress.random();
      const feeContract = await AztecAddress.random();
      const feePayer = await AztecAddress.random();

      const appPayload = createPrivateExecutionPayload('app', [Fr.random()], appContract, 1);
      batchCall = new BatchCall(wallet, [appPayload]);

      const feeCall = createPrivateExecutionPayload('payFee', [], feeContract).calls[0];
      const feePayload = new ExecutionPayload([feeCall], [], [], [], feePayer);

      const paymentMethod = mock<FeePaymentMethod>();
      paymentMethod.getExecutionPayload.mockResolvedValue(feePayload);

      const txSimResult = mockTxSimResult();
      txSimResult.getPrivateReturnValuesOfAppCall.mockReturnValue({ values: [Fr.random()] } as any);
      wallet.batch.mockResolvedValue([{ name: 'simulateTx', result: txSimResult }] as any);

      await batchCall.simulate({ from: await AztecAddress.random(), fee: { paymentMethod } });

      const methods = wallet.batch.mock.calls[0][0] as any[];
      const { args } = methods.find(m => m.name === 'simulateTx')!;
      const [executionPayload] = args;
      expect(executionPayload.calls).toHaveLength(2);
      expect(executionPayload.calls[0]).toEqual(feeCall);
      expect(executionPayload.calls[1]).toEqual(appPayload.calls[0]);
      expect(executionPayload.feePayer).toEqual(feePayer);
    });

    it('preserves a fee payer carried by a batched execution payload', async () => {
      const appContract = await AztecAddress.random();
      const feePayer = await AztecAddress.random();

      const appCall = createPrivateExecutionPayload('app', [Fr.random()], appContract, 1).calls[0];
      const payloadWithFeePayer = new ExecutionPayload([appCall], [], [], [], feePayer);
      batchCall = new BatchCall(wallet, [payloadWithFeePayer]);

      const txSimResult = mockTxSimResult();
      txSimResult.getPrivateReturnValuesOfAppCall.mockReturnValue({ values: [Fr.random()] } as any);
      wallet.batch.mockResolvedValue([{ name: 'simulateTx', result: txSimResult }] as any);

      await batchCall.simulate({ from: await AztecAddress.random() });

      const methods = wallet.batch.mock.calls[0][0] as any[];
      const { args } = methods.find(m => m.name === 'simulateTx')!;
      expect(args[0].feePayer).toEqual(feePayer);
    });
  });

  describe('request', () => {
    it('should include fee payment method if provided', async () => {
      const contractAddress = await AztecAddress.random();
      const payload = createPrivateExecutionPayload('func', [Fr.random()], contractAddress);

      batchCall = new BatchCall(wallet, [payload]);

      const feePayload = createPrivateExecutionPayload('payFee', [Fr.random()], await AztecAddress.random());

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

    it('should propagate authWitnesses, capsules, and extraHashedArgs into the execution payload', async () => {
      const contractAddress = await AztecAddress.random();
      const payload = createPrivateExecutionPayload('func', [Fr.random()], contractAddress);

      const authWitness = AuthWitness.random();
      const capsule = new Capsule(await AztecAddress.random(), Fr.random(), [Fr.random()]);
      const extraHashedArgs = [HashedValues.random()];

      batchCall = new BatchCall(wallet, [payload], extraHashedArgs);
      // Inject authWitnesses and capsules into the interaction (as BaseContractInteraction exposes these)
      (batchCall as any).authWitnesses = [authWitness];
      (batchCall as any).capsules = [capsule];

      const result = await batchCall.request();

      expect(result.calls).toHaveLength(1);
      expect(result.calls[0]).toEqual(payload.calls[0]);
      expect(result.authWitnesses).toContainEqual(authWitness);
      expect(result.capsules).toContainEqual(capsule);
      expect(result.extraHashedArgs).toContainEqual(extraHashedArgs[0]);
    });
  });
});
