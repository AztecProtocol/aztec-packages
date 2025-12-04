import type { TraceTransactionResponse, ViemPublicDebugClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';
import type { Hex } from 'viem';

import traceTransactionMultipleProposeFixture from '../../test/fixtures/trace_transaction-multiplePropose.json' with { type: 'json' };
import traceTransactionFixture from '../../test/fixtures/trace_transaction-proxied.json' with { type: 'json' };
import traceTransactionRevertFixture from '../../test/fixtures/trace_transaction-randomRevert.json' with { type: 'json' };
import { getSuccessfulCallsFromTrace } from './trace_tx.js';

describe('getSuccessfulCallsFromTrace', () => {
  let mockClient: ViemPublicDebugClient;

  beforeEach(() => {
    mockClient = {
      request: jest.fn<any>(),
    } as any;
  });

  it('should extract call operations matching target address and function selector', async () => {
    // Setup mock to return the fixture
    (mockClient.request as any).mockResolvedValue(traceTransactionFixture);

    const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
    const targetAddress = EthAddress.fromString('0x84b4f526b3f4be78f967ebf566bbb65ffbb95226'); // Address from fixture
    const functionSelector = '0xab98c5f8'; // Function selector from fixture

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    // Verify request was made with correct parameters
    expect(mockClient.request).toHaveBeenCalledWith({
      method: 'trace_transaction',
      params: [txHash],
    });

    // Should find at least one matching call
    expect(results.length).toBeGreaterThan(0);
    results.forEach(result => {
      expect(result.from).toBeInstanceOf(EthAddress);
      expect(typeof result.gasUsed).toBe('bigint');
      expect(typeof result.value).toBe('bigint');
      expect(result.input.toLowerCase()).toContain('ab98c5f8');
    });
  });

  it('should handle address and selector case insensitivity', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionFixture);

    const txHash = '0xabc' as Hex;
    // Use uppercase address and selector
    const targetAddress = EthAddress.fromString('0X84B4F526B3F4BE78F967EBF566BBB65FFBB95226');
    const functionSelector = '0XAB98C5F8';

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle function selector without 0x prefix', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionFixture);

    const txHash = '0xabc' as Hex;
    const targetAddress = EthAddress.fromString('0x84b4f526b3f4be78f967ebf566bbb65ffbb95226');
    const functionSelector = 'ab98c5f8'; // Without 0x prefix

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    expect(results.length).toBeGreaterThan(0);
  });

  it('should not include delegatecall or staticcall operations', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionFixture);

    const txHash = '0xabc' as Hex;
    // Target a contract that has delegatecall in the trace
    const targetAddress = EthAddress.fromString('0x43506849d7c04f9138d1a2050bbf3a0c054402dd');
    const functionSelector = '0xa9059cbb';

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    // Should not find any results because the calls to this address are delegatecalls
    expect(results).toHaveLength(0);
  });

  it('should return empty array when no matching calls found', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionFixture);

    const txHash = '0xabc' as Hex;
    const targetAddress = EthAddress.fromString('0x0000000000000000000000000000000000000000'); // Non-existent address
    const functionSelector = '0x00000000'; // Non-existent selector

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    expect(results).toHaveLength(0);
  });

  it('should filter by function selector even when address matches', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionFixture);

    const txHash = '0xabc' as Hex;
    const targetAddress = EthAddress.fromString('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'); // Correct address
    const functionSelector = '0xffffffff'; // Wrong selector

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    expect(results).toHaveLength(0);
  });

  it('should include value field defaulting to 0x0 when not present', async () => {
    const mockTrace: TraceTransactionResponse[] = [
      {
        action: {
          from: '0x1000000000000000000000000000000000000001',
          to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          callType: 'call',
          input: '0xa9059cbb000000',
          gas: '0x1000',
          // value field omitted
        },
        result: {
          gasUsed: '0x500',
        },
        subtraces: 0,
        traceAddress: [],
        type: 'call',
      },
    ];

    (mockClient.request as any).mockResolvedValue(mockTrace);

    const txHash = '0xabc' as Hex;
    const results = await getSuccessfulCallsFromTrace(
      mockClient,
      txHash,
      EthAddress.fromString('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
      '0xa9059cbb',
    );

    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0n);
  });

  it('should handle traces with errors by including the errored call but not its descendants', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionRevertFixture);

    const txHash = '0xabc' as Hex;
    const targetAddress = EthAddress.fromString('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    const functionSelector = '0x01ffc9a7'; // supportsInterface selector

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    // The fixture has traces with errors, but we should not include them since they don't have results
    expect(results).toHaveLength(0);
  });

  it('should not include calls that are descendants of errored traces', async () => {
    const mockTrace: TraceTransactionResponse[] = [
      {
        action: {
          from: '0x1000000000000000000000000000000000000001',
          to: '0x2000000000000000000000000000000000000002',
          callType: 'call',
          input: '0xabcd',
          gas: '0x5000',
        },
        result: {
          gasUsed: '0x2000',
        },
        error: 'execution reverted',
        subtraces: 1,
        traceAddress: [0],
        type: 'call',
      },
      {
        action: {
          from: '0x2000000000000000000000000000000000000002',
          to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          callType: 'call',
          input: '0xa9059cbb000000',
          gas: '0x2000',
        },
        result: {
          gasUsed: '0x1000',
        },
        subtraces: 0,
        traceAddress: [0, 0],
        type: 'call',
      },
    ];

    (mockClient.request as any).mockResolvedValue(mockTrace);

    const txHash = '0xabc' as Hex;
    const results = await getSuccessfulCallsFromTrace(
      mockClient,
      txHash,
      EthAddress.fromString('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
      '0xa9059cbb',
    );

    // Should not find the nested call because its parent errored
    expect(results).toHaveLength(0);
  });

  it('should process multiple matching calls at different nesting levels', async () => {
    const targetAddr = '0x0000000000000000000000000000000000001111';
    const mockTrace: TraceTransactionResponse[] = [
      {
        action: {
          from: '0x1000000000000000000000000000000000000001',
          to: targetAddr,
          callType: 'call',
          input: '0x1234567800000000000000000000000000000000000000000000000000000000',
          gas: '0x3000',
          value: '0x200',
        },
        result: {
          gasUsed: '0x1500',
        },
        subtraces: 0,
        traceAddress: [0],
        type: 'call',
      },
      {
        action: {
          from: '0x2000000000000000000000000000000000000002',
          to: '0x3000000000000000000000000000000000000003',
          callType: 'call',
          input: '0xabcd0000',
          gas: '0x5000',
        },
        result: {
          gasUsed: '0x2000',
        },
        subtraces: 1,
        traceAddress: [1],
        type: 'call',
      },
      {
        action: {
          from: '0x3000000000000000000000000000000000000003',
          to: targetAddr,
          callType: 'call',
          input: '0x12345678ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          gas: '0x2000',
          value: '0x100',
        },
        result: {
          gasUsed: '0x1000',
        },
        subtraces: 0,
        traceAddress: [1, 0],
        type: 'call',
      },
    ];

    (mockClient.request as any).mockResolvedValue(mockTrace);

    const txHash = '0xabc' as Hex;
    const results = await getSuccessfulCallsFromTrace(
      mockClient,
      txHash,
      EthAddress.fromString(targetAddr),
      '0x12345678',
    );

    // Should find both calls
    expect(results).toHaveLength(2);
    expect(results[0].from).toEqual(EthAddress.fromString('0x1000000000000000000000000000000000000001'));
    expect(results[0].gasUsed).toBe(BigInt('0x1500'));
    expect(results[0].value).toBe(BigInt('0x200'));
    expect(results[1].from).toEqual(EthAddress.fromString('0x3000000000000000000000000000000000000003'));
    expect(results[1].gasUsed).toBe(BigInt('0x1000'));
    expect(results[1].value).toBe(BigInt('0x100'));
  });

  it('should only include traces with a result (skip those with error but no result)', async () => {
    const targetAddr = '0x0000000000000000000000000000000000001111';
    const mockTrace: TraceTransactionResponse[] = [
      {
        action: {
          from: '0x1000000000000000000000000000000000000001',
          to: targetAddr,
          callType: 'call',
          input: '0x1234567800000000000000000000000000000000000000000000000000000000',
          gas: '0x2000',
          value: '0x100',
        },
        error: 'execution reverted',
        subtraces: 0,
        traceAddress: [0],
        type: 'call',
      },
    ];

    (mockClient.request as any).mockResolvedValue(mockTrace);

    const txHash = '0xabc' as Hex;
    const results = await getSuccessfulCallsFromTrace(
      mockClient,
      txHash,
      EthAddress.fromString(targetAddr),
      '0x12345678',
    );

    // Should not include because error occurred and no result
    expect(results).toHaveLength(0);
  });

  it('should return only one result when multiple propose calls exist but one failed', async () => {
    (mockClient.request as any).mockResolvedValue(traceTransactionMultipleProposeFixture);

    const txHash = '0xabc' as Hex;
    const targetAddress = EthAddress.fromString('0x4ed7c70f96b99c776995fb64377f0d4ab3b0e1c1');
    // PROPOSE_SELECTOR = toFunctionSelector(RollupAbi.find(x => x.type === 'function' && x.name === 'propose')!)
    const functionSelector = '0x48aeda19';

    const results = await getSuccessfulCallsFromTrace(mockClient, txHash, targetAddress, functionSelector);

    // Should only find one matching call because the first propose call failed (had an error)
    // even though both have result fields
    expect(results).toHaveLength(1);
    expect(results[0].from).toEqual(EthAddress.fromString('0xca11bde05977b3631167028862be2a173976ca11'));
  });
});
