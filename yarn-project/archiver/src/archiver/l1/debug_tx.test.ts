import type { DebugCallTrace, ViemPublicClient } from '@aztec/ethereum/types';
import { EthAddress } from '@aztec/foundation/eth-address';

import { type MockProxy, mock } from 'jest-mock-extended';
import type { Hex } from 'viem';

import debugTraceMultipleProposeFixture from '../../test/fixtures/debug_traceTransaction-multiplePropose.json' with { type: 'json' };
import debugTraceFixture from '../../test/fixtures/debug_traceTransaction-proxied.json' with { type: 'json' };
import { getSuccessfulCallsFromDebug } from './debug_tx.js';

describe('getSuccessfulCallsFromDebug', () => {
  let mockClient: MockProxy<ViemPublicClient>;
  let txHash: Hex;

  beforeEach(() => {
    txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    mockClient = mock<ViemPublicClient>();
  });

  it('should extract CALL operations matching target address and function selector', async () => {
    // Setup mock to return the fixture
    mockClient.request.mockResolvedValue(debugTraceFixture);

    const targetAddress = EthAddress.fromString('0x603bb2c05d474794ea97805e8de69bccfb3bca12'); // Address from fixture
    const functionSelector = '0x48aeda19'; // Function selector from fixture

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    // Verify request was made with correct parameters
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'debug_traceTransaction',
      params: [txHash, { tracer: 'callTracer' }],
    });

    // Should find the CALL to 0x603bb2c05d474794ea97805e8de69bccfb3bca12 with function selector 0x48aeda19
    expect(results).toHaveLength(1);
    expect(results[0].from).toEqual(EthAddress.fromString('0xca11bde05977b3631167028862be2a173976ca11'));
    expect(results[0].gasUsed).toBe(BigInt('0x2c30f'));
    expect(results[0].value).toBe(BigInt('0x0'));
    expect(results[0].input).toContain('48aeda19');
  });

  it('should handle address and selector case insensitivity', async () => {
    mockClient.request.mockResolvedValue(debugTraceFixture);

    // Use uppercase address and selector
    const targetAddress = EthAddress.fromString('0X603BB2C05D474794EA97805E8DE69BCCFB3BCA12');
    const functionSelector = '0X48AEDA19';

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    expect(results).toHaveLength(1);
  });

  it('should handle function selector without 0x prefix', async () => {
    mockClient.request.mockResolvedValue(debugTraceFixture);

    const targetAddress = EthAddress.fromString('0x603bb2c05d474794ea97805e8de69bccfb3bca12');
    const functionSelector = '48aeda19'; // Without 0x prefix

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    expect(results).toHaveLength(1);
  });

  it('should not include DELEGATECALL or STATICCALL operations', async () => {
    mockClient.request.mockResolvedValue(debugTraceFixture);

    // Target a contract that has DELEGATECALL in the trace
    const targetAddress = EthAddress.fromString('0x1e0a5d9f39c4393b71dd4c6d038be4b77266c1a4'); // Has DELEGATECALL in fixture
    const functionSelector = '0x547b8598'; // Function selector from the DELEGATECALL

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    // Should not find any results because it's a DELEGATECALL, not a CALL
    expect(results).toHaveLength(0);
  });

  it('should return empty array when no matching calls found', async () => {
    mockClient.request.mockResolvedValue(debugTraceFixture);

    const targetAddress = EthAddress.fromString('0x0000000000000000000000000000000000000000'); // Non-existent address
    const functionSelector = '0x00000000'; // Non-existent selector

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    expect(results).toHaveLength(0);
  });

  it('should filter by function selector even when address matches', async () => {
    mockClient.request.mockResolvedValue(debugTraceFixture);

    const targetAddress = EthAddress.fromString('0x603bb2c05d474794ea97805e8de69bccfb3bca12'); // Correct address
    const functionSelector = '0xffffffff'; // Wrong selector

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    expect(results).toHaveLength(0);
  });

  it('should include value field defaulting to 0x0 when not present', async () => {
    const mockTrace: DebugCallTrace = {
      from: '0x1000000000000000000000000000000000000001',
      to: '0x2000000000000000000000000000000000000002',
      type: 'CALL',
      input: '0x',
      gas: '0x1000',
      gasUsed: '0x500',
      calls: [
        {
          from: '0x1000000000000000000000000000000000000001',
          to: '0x603bb2c05d474794ea97805e8de69bccfb3bca12',
          type: 'CALL',
          input: '0x48aeda19000000',
          gas: '0x1000',
          gasUsed: '0x500',
          // value field omitted
        },
      ],
    };

    mockClient.request.mockResolvedValue(mockTrace);

    const results = await getSuccessfulCallsFromDebug(
      mockClient,
      txHash,
      EthAddress.fromString('0x603bb2c05d474794ea97805e8de69bccfb3bca12'),
      '0x48aeda19',
    );

    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0n);
  });

  it('should traverse nested calls at multiple levels', async () => {
    const targetAddr = '0x0000000000000000000000000000000000001111';
    const mockTrace: DebugCallTrace = {
      from: '0x1000000000000000000000000000000000000001',
      to: '0x2000000000000000000000000000000000000002',
      type: 'CALL',
      input: '0x',
      gas: '0x10000',
      gasUsed: '0x5000',
      calls: [
        {
          from: '0x2000000000000000000000000000000000000002',
          to: '0x3000000000000000000000000000000000000003',
          type: 'CALL',
          input: '0xabcd0000',
          gas: '0x5000',
          gasUsed: '0x2000',
          calls: [
            {
              from: '0x3000000000000000000000000000000000000003',
              to: targetAddr,
              type: 'CALL',
              input: '0x1234567800000000000000000000000000000000000000000000000000000000',
              gas: '0x2000',
              gasUsed: '0x1000',
              value: '0x100',
            },
          ],
        },
        {
          from: '0x2000000000000000000000000000000000000002',
          to: targetAddr,
          type: 'CALL',
          input: '0x12345678ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          gas: '0x3000',
          gasUsed: '0x1500',
          value: '0x200',
        },
      ],
    };

    mockClient.request.mockResolvedValue(mockTrace);

    const results = await getSuccessfulCallsFromDebug(
      mockClient,
      txHash,
      EthAddress.fromString(targetAddr),
      '0x12345678',
    );

    // Should find both nested calls
    expect(results).toHaveLength(2);
    expect(results[0].from).toEqual(EthAddress.fromString('0x3000000000000000000000000000000000000003'));
    expect(results[0].gasUsed).toBe(BigInt('0x1000'));
    expect(results[0].value).toBe(BigInt('0x100'));
    expect(results[1].from).toEqual(EthAddress.fromString('0x2000000000000000000000000000000000000002'));
    expect(results[1].gasUsed).toBe(BigInt('0x1500'));
    expect(results[1].value).toBe(BigInt('0x200'));
  });

  it('should not include calls that have errors', async () => {
    const targetAddr = '0x0000000000000000000000000000000000001111';
    const mockTrace: DebugCallTrace = {
      from: '0x1000000000000000000000000000000000000001',
      to: '0x2000000000000000000000000000000000000002',
      type: 'CALL',
      input: '0x',
      gas: '0x10000',
      gasUsed: '0x5000',
      calls: [
        {
          from: '0x2000000000000000000000000000000000000002',
          to: targetAddr,
          type: 'CALL',
          input: '0x1234567800000000000000000000000000000000000000000000000000000000',
          gas: '0x2000',
          gasUsed: '0x1000',
          value: '0x100',
          error: 'execution reverted',
        },
      ],
    };

    mockClient.request.mockResolvedValue(mockTrace);

    const results = await getSuccessfulCallsFromDebug(
      mockClient,
      txHash,
      EthAddress.fromString(targetAddr),
      '0x12345678',
    );

    // Should not find the call because it has an error
    expect(results).toHaveLength(0);
  });

  it('should not recurse into nested calls when parent call has an error', async () => {
    const targetAddr = '0x0000000000000000000000000000000000001111';
    const mockTrace: DebugCallTrace = {
      from: '0x1000000000000000000000000000000000000001',
      to: '0x2000000000000000000000000000000000000002',
      type: 'CALL',
      input: '0x',
      gas: '0x10000',
      gasUsed: '0x5000',
      calls: [
        {
          from: '0x2000000000000000000000000000000000000002',
          to: '0x3000000000000000000000000000000000000003',
          type: 'CALL',
          input: '0xabcd0000',
          gas: '0x5000',
          gasUsed: '0x2000',
          error: 'execution reverted',
          // This nested call should not be processed because parent errored
          calls: [
            {
              from: '0x3000000000000000000000000000000000000003',
              to: targetAddr,
              type: 'CALL',
              input: '0x1234567800000000000000000000000000000000000000000000000000000000',
              gas: '0x2000',
              gasUsed: '0x1000',
              value: '0x100',
            },
          ],
        },
      ],
    };

    mockClient.request.mockResolvedValue(mockTrace);

    const results = await getSuccessfulCallsFromDebug(
      mockClient,
      txHash,
      EthAddress.fromString(targetAddr),
      '0x12345678',
    );

    // Should not find any calls because the parent call errored, so nested calls didn't execute
    expect(results).toHaveLength(0);
  });

  it('should return only one result when multiple propose calls exist but one failed', async () => {
    // Fixture generated from e2e_debug_trace.test.ts
    mockClient.request.mockResolvedValue(debugTraceMultipleProposeFixture);

    const txHash = '0xabc' as Hex;
    const targetAddress = EthAddress.fromString('0x4ed7c70f96b99c776995fb64377f0d4ab3b0e1c1');
    // PROPOSE_SELECTOR = toFunctionSelector(RollupAbi.find(x => x.type === 'function' && x.name === 'propose')!)
    const functionSelector = '0x48aeda19';

    const results = await getSuccessfulCallsFromDebug(mockClient, txHash, targetAddress, functionSelector);

    // Should only find one matching call because the first propose call failed (had an error)
    expect(results).toHaveLength(1);
    expect(results[0].from).toEqual(EthAddress.fromString('0xca11bde05977b3631167028862be2a173976ca11'));
    expect(results[0].gasUsed).toBe(BigInt('0x3eb5a'));
  });
});
