import { L1RpcError } from '@aztec/ethereum/client';
import { MULTI_CALL_3_ADDRESS, type ViemCommitteeAttestations, type ViemHeader } from '@aztec/ethereum/contracts';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { withHexPrefix } from '@aztec/foundation/string';
import { RollupAbi } from '@aztec/l1-artifacts';
import { Signature } from '@aztec/stdlib/block';
import { computeCheckpointPayloadDigest } from '@aztec/stdlib/checkpoint';
import {
  CheckpointHeader,
  l1CheckpointHeaderHash,
  toCheckpointHeader,
  toL1CheckpointHeader,
} from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type Hex,
  type Transaction,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  multicall3Abi,
  toFunctionSelector,
} from 'viem';

import type { ArchiverInstrumentation } from '../modules/instrumentation.js';
import { CalldataRetriever } from './calldata_retriever.js';
import {
  EIP1967_IMPLEMENTATION_SLOT,
  SPIRE_PROPOSER_ADDRESS,
  SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION,
  getCallsFromSpireProposer,
  verifyProxyImplementation,
} from './spire_proposer.js';

/**
 * Test class that exposes protected methods for testing
 */
class TestCalldataRetriever extends CalldataRetriever {
  public override tryDecodeMulticall3(
    tx: Transaction,
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ) {
    return super.tryDecodeMulticall3(tx, expectedHashes, checkpointNumber, blockHash);
  }

  public override tryDecodeDirectPropose(
    tx: Transaction,
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ) {
    return super.tryDecodeDirectPropose(tx, expectedHashes, checkpointNumber, blockHash);
  }

  public override async extractCalldataViaTrace(txHash: Hex): Promise<Hex> {
    return await super.extractCalldataViaTrace(txHash);
  }

  public override tryDecodeAndVerifyPropose(
    proposeCalldata: Hex,
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ) {
    return super.tryDecodeAndVerifyPropose(proposeCalldata, expectedHashes, checkpointNumber, blockHash);
  }
}

describe('CalldataRetriever', () => {
  let publicClient: MockProxy<ViemPublicClient>;
  let debugClient: MockProxy<ViemPublicDebugClient>;
  let logger: Logger;
  let retriever: TestCalldataRetriever;
  let txHash: Hex;
  let instrumentation: MockProxy<ArchiverInstrumentation>;

  const TARGET_COMMITTEE_SIZE = 5;
  const rollupAddress = EthAddress.random();
  const blockHash = Buffer32.random().toString();
  const checkpointNumber = CheckpointNumber(42);

  beforeEach(() => {
    txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    publicClient = mock<ViemPublicClient>();
    // CalldataRetriever reads `publicClient.chain.id` to build the EIP-712 signing context.
    (publicClient as unknown as { chain: { id: number } }).chain = { id: 1 };
    debugClient = mock<ViemPublicDebugClient>();
    logger = createLogger('test:calldata_retriever');
    instrumentation = mock<ArchiverInstrumentation>();

    retriever = new TestCalldataRetriever(
      publicClient,
      debugClient,
      TARGET_COMMITTEE_SIZE,
      instrumentation,
      logger,
      rollupAddress,
    );
  });

  function makeViemHeader(): ViemHeader {
    return toL1CheckpointHeader(CheckpointHeader.random());
  }

  function makeViemCommitteeAttestations(): ViemCommitteeAttestations {
    // Create a simple bitmap with no signatures for simplicity
    const signatureIndices = '00'.repeat(Math.ceil(TARGET_COMMITTEE_SIZE / 8));

    // For unsigned attestations, we need addresses (20 bytes each)
    const addresses = times(TARGET_COMMITTEE_SIZE, () => EthAddress.random().toString().slice(2)).join('');

    return {
      signatureIndices: withHexPrefix(signatureIndices),
      signaturesOrAddresses: withHexPrefix(addresses),
    };
  }

  function makeProposeCalldata(
    header?: ViemHeader,
    attestations: ViemCommitteeAttestations = makeViemCommitteeAttestations(),
  ): Hex {
    const viemHeader = header || makeViemHeader();
    const archive = Fr.random().toString() as Hex;
    const signers: Hex[] = [];
    const attestationsAndSignersSignature: ViemSignature = Signature.random().toViemSignature();
    const blobInput = '0x' as Hex;

    return encodeFunctionData({
      abi: RollupAbi,
      functionName: 'propose',
      args: [
        {
          archive,
          oracleInput: { feeAssetPriceModifier: BigInt(0) },
          header: viemHeader,
        },
        attestations,
        signers,
        attestationsAndSignersSignature,
        blobInput,
      ],
    });
  }

  /**
   * Sets up mocks for the hash computation methods to return specific test hashes.
   * This allows us to test validation logic without recomputing hashes (which would duplicate production logic).
   */
  function mockHashComputation(
    attestationsHash: Hex = '0x1111111111111111111111111111111111111111111111111111111111111111',
    payloadDigest: Hex = '0x2222222222222222222222222222222222222222222222222222222222222222',
  ): { attestationsHash: Hex; payloadDigest: Hex } {
    jest.spyOn(retriever as any, 'computeAttestationsHash').mockReturnValue(attestationsHash);
    jest.spyOn(retriever as any, 'computePayloadDigest').mockReturnValue(payloadDigest);
    return { attestationsHash, payloadDigest };
  }

  function makeMulticall3Transaction(calls: { target: Hex; callData: Hex }[]): Transaction {
    const multicall3Data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [calls.map(c => ({ target: c.target, allowFailure: false, callData: c.callData }))],
    });

    return {
      input: multicall3Data,
      blockHash,
      to: MULTI_CALL_3_ADDRESS as Hex,
    } as Transaction;
  }

  describe('getCheckpointFromRollupTx', () => {
    it('should successfully decode valid multicall3 transaction', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);
      const hashes = mockHashComputation();

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Buffer32);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(tx.blockHash);
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(MULTI_CALL_3_ADDRESS, false);
    });

    it('should fall back to direct propose when multicall3 decoding fails', async () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();

      // Transaction that's not multicall3 but is a direct propose call
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        blockHash,
        hash: txHash,
      } as Transaction;

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(rollupAddress.toString(), false);
    });

    it('should fall back to trace when both multicall3 and direct propose fail', async () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();

      // Transaction that's neither multicall3 nor direct propose (wrong address)
      const wrongAddress = EthAddress.random();
      const tx = {
        input: proposeCalldata,
        to: wrongAddress.toString() as Hex,
        blockHash,
        hash: txHash,
      } as Transaction;

      publicClient.getTransaction.mockResolvedValue(tx);

      // Mock the debug client to return a successful trace
      debugClient.request.mockResolvedValueOnce([
        {
          type: 'call',
          action: {
            from: EthAddress.random().toString(),
            to: rollupAddress.toString(),
            callType: 'call',
            input: proposeCalldata,
            value: '0x0',
            gas: '0x5208',
          },
          result: {
            output: '0x',
            gasUsed: '0x5208',
          },
          subtraces: 0,
          traceAddress: [],
        },
      ]);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(debugClient.request).toHaveBeenCalledWith({ method: 'trace_transaction', params: [txHash] });
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(wrongAddress.toString(), true);
    });

    it('should throw when tracing fails', async () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();

      // Transaction that's neither multicall3 nor direct propose (wrong address)
      const wrongAddress = EthAddress.random();
      const tx = {
        input: proposeCalldata,
        to: wrongAddress.toString() as Hex,
        blockHash,
        hash: txHash,
      } as Transaction;

      publicClient.getTransaction.mockResolvedValue(tx);

      // Mock both trace methods to fail
      debugClient.request.mockRejectedValue(new Error(`Method not available`));

      await expect(retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes)).rejects.toThrow(
        'Failed to trace transaction',
      );
    });

    it('should throw when transaction retrieval fails', async () => {
      const hashes = mockHashComputation();
      publicClient.getTransaction.mockRejectedValue(new Error('Transaction not found'));

      await expect(retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes)).rejects.toThrow(
        'Transaction not found',
      );
    });

    it('should validate attestationsHash', async () => {
      const attestations = makeViemCommitteeAttestations();
      const proposeCalldata = makeProposeCalldata(undefined, attestations);
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      // Compute the expected attestationsHash
      const expectedAttestationsHash = keccak256(
        encodeAbiParameters(
          [
            {
              type: 'tuple',
              components: [
                { name: 'signatureIndices', type: 'bytes' },
                { name: 'signaturesOrAddresses', type: 'bytes' },
              ],
            },
          ],
          [
            {
              signatureIndices: attestations.signatureIndices,
              signaturesOrAddresses: attestations.signaturesOrAddresses,
            },
          ],
        ),
      );

      // Mock only payloadDigest computation; use real attestationsHash
      jest
        .spyOn(retriever as any, 'computePayloadDigest')
        .mockReturnValue('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
        attestationsHash: expectedAttestationsHash,
        payloadDigest: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
      });

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
    });

    it('should throw when attestationsHash does not match', async () => {
      const attestations = makeViemCommitteeAttestations();
      const proposeCalldata = makeProposeCalldata(undefined, attestations);
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);
      const hashes = mockHashComputation();

      publicClient.getTransaction.mockResolvedValue(tx);

      // Use a different (wrong) attestationsHash — hash mismatch causes tryDecodeMulticall3 to
      // return undefined, falling through to trace which fails in tests
      const wrongAttestationsHash = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      await expect(
        retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
          attestationsHash: wrongAttestationsHash,
          payloadDigest: hashes.payloadDigest,
        }),
      ).rejects.toThrow('Failed to trace');
    });

    it('should validate payloadDigest', async () => {
      const header = makeViemHeader();
      const attestations = makeViemCommitteeAttestations();
      const archiveRoot = Fr.random();
      const archive = archiveRoot.toString() as Hex;
      const feeAssetPriceModifier = BigInt(-1);

      // Create propose calldata with known values
      const proposeCalldata = encodeFunctionData({
        abi: RollupAbi,
        functionName: 'propose',
        args: [
          {
            archive,
            oracleInput: { feeAssetPriceModifier },
            header,
          },
          attestations,
          [], // signers
          Signature.random().toViemSignature(),
          '0x' as Hex, // blobInput
        ],
      });

      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);
      publicClient.getTransaction.mockResolvedValue(tx);

      // Compute the expected payloadDigest using the same raw EIP-712 typed data hash
      // that CalldataRetriever.computePayloadDigest uses under the hood.
      const expectedPayloadDigest = computeCheckpointPayloadDigest({
        headerHash: l1CheckpointHeaderHash(header),
        archiveRoot,
        feeAssetPriceModifier,
        signatureContext: { chainId: 1, rollupAddress },
      }).toString() as Hex;

      // Mock only attestationsHash computation; use real payloadDigest
      jest
        .spyOn(retriever as any, 'computeAttestationsHash')
        .mockReturnValue('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
        attestationsHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
        payloadDigest: expectedPayloadDigest,
      });

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
    });

    it('should throw when payloadDigest does not match', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);
      const hashes = mockHashComputation();

      publicClient.getTransaction.mockResolvedValue(tx);

      // Use a different (wrong) payloadDigest — hash mismatch causes tryDecodeMulticall3 to
      // return undefined, falling through to trace which fails in tests
      const wrongPayloadDigest = '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex;

      await expect(
        retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
          attestationsHash: hashes.attestationsHash,
          payloadDigest: wrongPayloadDigest,
        }),
      ).rejects.toThrow('Failed to trace');
    });
  });

  describe('tryDecodeMulticall3', () => {
    it('should decode multicall3 with single verified propose call', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString() as Hex, callData: proposeCalldata }]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeDefined();
      expect(toCheckpointHeader(result!.header)).toBeInstanceOf(CheckpointHeader);
      expect(result!.archiveRoot).toBeInstanceOf(Buffer32);
      expect(result!.checkpointNumber).toBe(checkpointNumber);
    });

    it('should decode multicall3 with propose and other calls (hash matching ignores non-propose)', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: invalidateBadCalldata },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeDefined();
      expect(toCheckpointHeader(result!.header)).toBeInstanceOf(CheckpointHeader);
    });

    it('should decode multicall3 with unknown calls when propose is hash-verified', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const unknownAddress = EthAddress.random();

      const tx = makeMulticall3Transaction([
        { target: unknownAddress.toString() as Hex, callData: '0x12345678' as Hex },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);
      expect(result).toBeDefined();
      expect(toCheckpointHeader(result!.header)).toBeInstanceOf(CheckpointHeader);
    });

    it('should return first when multiple propose candidates all verify (with warning)', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();

      // Same calldata twice -> both verify
      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      const warnSpy = jest.spyOn(logger, 'warn');
      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);
      expect(result).toBeDefined();
      expect(toCheckpointHeader(result!.header)).toBeInstanceOf(CheckpointHeader);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Multiple propose candidates verified'),
        expect.any(Object),
      );
      warnSpy.mockRestore();
    });

    it('should return the verified candidate when only one of multiple candidates verifies', () => {
      const proposeCalldata1 = makeProposeCalldata();
      const proposeCalldata2 = makeProposeCalldata();

      const hashes = mockHashComputation();

      // Mock tryDecodeAndVerifyPropose to be selective - only first calldata verifies
      jest.spyOn(retriever, 'tryDecodeAndVerifyPropose').mockImplementation((calldata, _hashes) => {
        if (calldata === proposeCalldata1) {
          return {
            checkpointNumber,
            archiveRoot: Buffer32.fromField(Fr.random()),
            header: toL1CheckpointHeader(CheckpointHeader.random()),
            attestations: [],
            blockHash,
            feeAssetPriceModifier: 0n,
          };
        }
        return undefined;
      });

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata1 },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata2 },
      ]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);
      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(checkpointNumber);
    });

    it('should return undefined when not to multicall3 address', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when to is null', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = {
        input: proposeCalldata,
        to: null,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when not multicall3 aggregate3', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = {
        input: proposeCalldata,
        to: MULTI_CALL_3_ADDRESS as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when propose call to wrong address', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const wrongRollupAddress = EthAddress.random();

      const tx = makeMulticall3Transaction([
        { target: wrongRollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no propose calls found', () => {
      const hashes = mockHashComputation();
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: invalidateBadCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when empty calls array', () => {
      const hashes = mockHashComputation();
      const tx = makeMulticall3Transaction([]);

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when hashes do not match', () => {
      const proposeCalldata = makeProposeCalldata();

      // Mock to return different hashes than expected
      mockHashComputation(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
      );

      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString() as Hex, callData: proposeCalldata }]);

      // Pass different hashes - validation will fail
      const result = retriever.tryDecodeMulticall3(
        tx,
        {
          attestationsHash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
          payloadDigest: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
        },
        checkpointNumber,
        blockHash as Hex,
      );
      expect(result).toBeUndefined();
    });

    it('should return undefined when decoding throws exception', () => {
      const hashes = mockHashComputation();
      const tx = {
        input: '0xinvalid' as Hex,
        to: MULTI_CALL_3_ADDRESS as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });
  });

  describe('tryDecodeDirectPropose', () => {
    it('should decode direct propose call to rollup', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
        blockHash: Buffer32.random().toString() as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeDefined();
      expect(toCheckpointHeader(result!.header)).toBeInstanceOf(CheckpointHeader);
      expect(result!.archiveRoot).toBeInstanceOf(Buffer32);
      expect(result!.checkpointNumber).toBe(checkpointNumber);
    });

    it('should return undefined when not to rollup address', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const wrongAddress = EthAddress.random();
      const tx = {
        input: proposeCalldata,
        to: wrongAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when to is null', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = {
        input: proposeCalldata,
        to: null,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when function is not propose', () => {
      const hashes = mockHashComputation();
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      const tx = {
        input: invalidateBadCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when input cannot be decoded', () => {
      const hashes = mockHashComputation();
      const tx = {
        input: '0xinvalid' as Hex,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when hashes do not match', () => {
      const proposeCalldata = makeProposeCalldata();

      // Mock to return different hashes than expected
      mockHashComputation(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
      );

      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(
        tx,
        {
          attestationsHash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
          payloadDigest: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
        },
        checkpointNumber,
        blockHash as Hex,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('tryDecodeSpireProposer', () => {
    function makeSpireProposerMulticallTransaction(calls: { target: Hex; data: Hex }[]): Transaction {
      const spireMulticallData = encodeFunctionData({
        abi: [
          {
            inputs: [
              {
                components: [
                  { internalType: 'address', name: 'proposer', type: 'address' },
                  { internalType: 'address', name: 'target', type: 'address' },
                  { internalType: 'bytes', name: 'data', type: 'bytes' },
                  { internalType: 'uint256', name: 'value', type: 'uint256' },
                  { internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
                ],
                internalType: 'struct IProposerMulticall.Call[]',
                name: '_calls',
                type: 'tuple[]',
              },
            ],
            name: 'multicall',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ] as const,
        functionName: 'multicall',
        args: [
          calls.map(call => ({
            proposer: EthAddress.random().toString() as Hex,
            target: call.target,
            data: call.data,
            value: 0n,
            gasLimit: 1000000n,
          })),
        ],
      });

      return {
        input: spireMulticallData,
        blockHash,
        to: SPIRE_PROPOSER_ADDRESS as Hex,
        hash: txHash,
      } as Transaction;
    }

    it('should decode Spire Proposer with direct propose call', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeSpireProposerMulticallTransaction([
        { target: rollupAddress.toString() as Hex, data: proposeCalldata },
      ]);

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallsFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result![0].to.toLowerCase()).toBe(rollupAddress.toString().toLowerCase());
      expect(result![0].data).toBe(proposeCalldata);
      expect(publicClient.getStorageAt).toHaveBeenCalledWith({
        address: SPIRE_PROPOSER_ADDRESS,
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
    });

    it('should decode Spire Proposer with multicall3 containing propose', async () => {
      const proposeCalldata = makeProposeCalldata();
      const multicall3Data = encodeFunctionData({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        args: [[{ target: rollupAddress.toString() as Hex, allowFailure: false, callData: proposeCalldata }]],
      });

      const tx = makeSpireProposerMulticallTransaction([{ target: MULTI_CALL_3_ADDRESS as Hex, data: multicall3Data }]);

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallsFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result![0].to).toBe(MULTI_CALL_3_ADDRESS);
      expect(result![0].data).toBe(multicall3Data);
    });

    it('should return all calls when Spire Proposer contains multiple calls', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeSpireProposerMulticallTransaction([
        { target: rollupAddress.toString() as Hex, data: proposeCalldata },
        { target: rollupAddress.toString() as Hex, data: proposeCalldata },
      ]);

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallsFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeDefined();
      expect(result).toHaveLength(2);
    });

    it('should return undefined when not to Spire Proposer address', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: txHash,
      } as Transaction;

      const result = await getCallsFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeUndefined();
      expect(publicClient.getStorageAt).not.toHaveBeenCalled();
    });

    it('should return undefined when proxy implementation verification fails', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeSpireProposerMulticallTransaction([
        { target: rollupAddress.toString() as Hex, data: proposeCalldata },
      ]);

      // Mock the proxy pointing to wrong implementation
      publicClient.getStorageAt.mockResolvedValue('0x000000000000000000000000wrongimplementation0000000000' as Hex);

      const result = await getCallsFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeUndefined();
    });

    it('should extract call even if target is unknown (validation happens in next step)', async () => {
      const unknownAddress = EthAddress.random();
      const tx = makeSpireProposerMulticallTransaction([
        { target: unknownAddress.toString() as Hex, data: '0x12345678' as Hex },
      ]);

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallsFromSpireProposer(tx, publicClient, logger);

      // Spire proposer should successfully extract the call, even if target is unknown
      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result![0].to.toLowerCase()).toBe(unknownAddress.toString().toLowerCase());
      expect(result![0].data).toBe('0x12345678');
    });
  });

  describe('verifyProxyImplementation', () => {
    it('should return true when proxy points to expected implementation', async () => {
      // Mock storage slot containing the implementation address (padded to 32 bytes)
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(true);
      expect(publicClient.getStorageAt).toHaveBeenCalledWith({
        address: SPIRE_PROPOSER_ADDRESS,
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
    });

    it('should return false when proxy points to different implementation', async () => {
      // Mock storage slot with wrong implementation
      publicClient.getStorageAt.mockResolvedValue('0x000000000000000000000000wrongimplementation0000000000' as Hex);

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(false);
    });

    it('should return false when storage slot is empty', async () => {
      publicClient.getStorageAt.mockResolvedValue(undefined);

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(false);
    });

    it('should return false when getStorageAt throws error', async () => {
      publicClient.getStorageAt.mockRejectedValue(new Error('RPC error'));

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(false);
    });
  });

  describe('extractCalldataViaTrace', () => {
    it('should successfully extract calldata using trace_transaction', async () => {
      const proposeCalldata = makeProposeCalldata();

      // Mock debug client to return a successful trace (trace_transaction format)
      debugClient.request.mockResolvedValueOnce([
        {
          type: 'call',
          action: {
            from: EthAddress.random().toString(),
            to: rollupAddress.toString(),
            callType: 'call',
            input: proposeCalldata,
            value: '0x0',
            gas: '0x5208',
          },
          result: {
            output: '0x',
            gasUsed: '0x5208',
          },
          subtraces: 0,
          traceAddress: [],
        },
      ]);

      const result = await retriever.extractCalldataViaTrace(txHash);

      expect(result).toBe(proposeCalldata);
      expect(debugClient.request).toHaveBeenCalledWith({ method: 'trace_transaction', params: [txHash] });
    });

    it('should fall back to debug_traceTransaction when trace_transaction fails', async () => {
      const proposeCalldata = makeProposeCalldata();

      // First call (trace_transaction) fails
      debugClient.request.mockRejectedValueOnce(
        new L1RpcError('L1 RPC request failed', { cause: new Error('trace_transaction not supported') }),
      );

      // Second call (debug_traceTransaction) succeeds - returns root trace with nested calls
      debugClient.request.mockResolvedValueOnce({
        type: 'CALL',
        from: EthAddress.random().toString(),
        to: EthAddress.random().toString(), // Some intermediate contract
        input: '0x',
        value: '0x0',
        gas: '0x100000',
        gasUsed: '0x50000',
        output: '0x',
        calls: [
          {
            type: 'CALL',
            from: EthAddress.random().toString(),
            to: rollupAddress.toString(),
            input: proposeCalldata,
            value: '0x0',
            gas: '0x50000',
            gasUsed: '0x5208',
            output: '0x',
          },
        ],
      });

      const result = await retriever.extractCalldataViaTrace(txHash);

      expect(result).toBe(proposeCalldata);
      expect(debugClient.request).toHaveBeenCalledTimes(2);
      expect(debugClient.request).toHaveBeenNthCalledWith(1, { method: 'trace_transaction', params: [txHash] });
      expect(debugClient.request).toHaveBeenNthCalledWith(2, {
        method: 'debug_traceTransaction',
        params: [txHash, { tracer: 'callTracer' }],
      });
    });

    it('should throw when both trace_transaction and debug_traceTransaction fail', async () => {
      // First call (trace_transaction) fails
      debugClient.request.mockRejectedValueOnce(new Error('trace_transaction not supported'));

      // Second call (debug_traceTransaction) also fails
      debugClient.request.mockRejectedValueOnce(new Error('debug_traceTransaction not supported'));

      await expect(retriever.extractCalldataViaTrace(txHash)).rejects.toThrow(
        'Failed to trace transaction ' + txHash + ' to extract propose calldata',
      );

      expect(debugClient.request).toHaveBeenCalledTimes(2);
    });

    it('should log trace+debug failure warn only once per tx hash', async () => {
      CalldataRetriever.resetTraceFailureWarnedForTesting();
      const warnSpy = jest.spyOn(logger, 'warn');

      // First attempt: both trace and debug fail
      debugClient.request.mockRejectedValueOnce(new Error('trace_transaction not supported'));
      debugClient.request.mockRejectedValueOnce(new Error('debug_traceTransaction not supported'));

      await expect(retriever.extractCalldataViaTrace(txHash)).rejects.toThrow(
        'Failed to trace transaction ' + txHash + ' to extract propose calldata',
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot decode L1 tx'));

      // Second attempt: same tx, both fail again - should not log warn again
      debugClient.request.mockRejectedValueOnce(new Error('trace_transaction not supported'));
      debugClient.request.mockRejectedValueOnce(new Error('debug_traceTransaction not supported'));

      await expect(retriever.extractCalldataViaTrace(txHash)).rejects.toThrow(
        'Failed to trace transaction ' + txHash + ' to extract propose calldata',
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('should throw when no propose calls found', async () => {
      // Mock debug client to return empty trace
      debugClient.request.mockResolvedValueOnce([]);

      await expect(retriever.extractCalldataViaTrace(txHash)).rejects.toThrow(
        'No successful propose calls found in transaction ' + txHash,
      );
    });

    it('should throw when multiple propose calls found', async () => {
      const proposeCalldata1 = makeProposeCalldata();
      const proposeCalldata2 = makeProposeCalldata();

      // Mock debug client to return trace with multiple propose calls
      debugClient.request.mockResolvedValueOnce([
        {
          type: 'call',
          action: {
            from: EthAddress.random().toString(),
            to: rollupAddress.toString(),
            callType: 'call',
            input: proposeCalldata1,
            value: '0x0',
            gas: '0x5208',
          },
          result: {
            output: '0x',
            gasUsed: '0x5208',
          },
          subtraces: 0,
          traceAddress: [],
        },
        {
          type: 'call',
          action: {
            from: EthAddress.random().toString(),
            to: rollupAddress.toString(),
            callType: 'call',
            input: proposeCalldata2,
            value: '0x0',
            gas: '0x5208',
          },
          result: {
            output: '0x',
            gasUsed: '0x5208',
          },
          subtraces: 0,
          traceAddress: [],
        },
      ]);

      await expect(retriever.extractCalldataViaTrace(txHash)).rejects.toThrow(
        'Multiple successful propose calls found in transaction ' + txHash + ' (2)',
      );
    });
  });

  describe('tryDecodeAndVerifyPropose', () => {
    it('should decode and verify propose calldata successfully', () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();

      const result = retriever.tryDecodeAndVerifyPropose(proposeCalldata, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeDefined();
      expect(result!.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result!.header)).toBeInstanceOf(CheckpointHeader);
      expect(result!.archiveRoot).toBeInstanceOf(Buffer32);
      expect(Array.isArray(result!.attestations)).toBe(true);
      expect(result!.blockHash).toBe(blockHash);
    });

    it('should handle attestations correctly', () => {
      const attestations = makeViemCommitteeAttestations();
      const proposeCalldata = makeProposeCalldata(undefined, attestations);
      const hashes = mockHashComputation();

      const result = retriever.tryDecodeAndVerifyPropose(proposeCalldata, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeDefined();
      expect(result!.attestations).toHaveLength(TARGET_COMMITTEE_SIZE);
    });

    it('should return undefined when calldata is not for propose function', () => {
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;
      const hashes = mockHashComputation();

      const result = retriever.tryDecodeAndVerifyPropose(invalidCalldata, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when calldata is malformed', () => {
      const malformedCalldata = '0xinvalid' as Hex;
      const hashes = mockHashComputation();

      const result = retriever.tryDecodeAndVerifyPropose(malformedCalldata, hashes, checkpointNumber, blockHash as Hex);

      expect(result).toBeUndefined();
    });

    it('should return undefined when attestationsHash does not match', () => {
      const proposeCalldata = makeProposeCalldata();
      mockHashComputation(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
      );

      const result = retriever.tryDecodeAndVerifyPropose(
        proposeCalldata,
        {
          attestationsHash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
          payloadDigest: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
        },
        checkpointNumber,
        blockHash as Hex,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined when payloadDigest does not match', () => {
      const proposeCalldata = makeProposeCalldata();
      mockHashComputation(
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex,
      );

      const result = retriever.tryDecodeAndVerifyPropose(
        proposeCalldata,
        {
          attestationsHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex,
          payloadDigest: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
        },
        checkpointNumber,
        blockHash as Hex,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('integration', () => {
    it('should complete full flow from tx hash to checkpoint via multicall3', async () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString() as Hex, callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result).toBeDefined();
      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Buffer32);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(tx.blockHash);

      // Verify all components are properly decoded
      expect(typeof result.header.inHash).toBe('string');
      expect(typeof result.header.gasFees.feePerDaGas).toBe('bigint');

      // Verify instrumentation was called
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(MULTI_CALL_3_ADDRESS, false);
    });

    it('should complete full flow from tx hash to checkpoint via Spire Proposer', async () => {
      const SPIRE_PROPOSER_ADDRESS = '0x9ccc2f3ecde026230e11a5c8799ac7524f2bb294';
      const SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION = '0x7d38d47e7c82195e6e607d3b0f1c20c615c7bf42';

      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation();

      // Create Spire Proposer multicall transaction
      const spireMulticallData = encodeFunctionData({
        abi: [
          {
            inputs: [
              {
                components: [
                  { internalType: 'address', name: 'proposer', type: 'address' },
                  { internalType: 'address', name: 'target', type: 'address' },
                  { internalType: 'bytes', name: 'data', type: 'bytes' },
                  { internalType: 'uint256', name: 'value', type: 'uint256' },
                  { internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
                ],
                internalType: 'struct IProposerMulticall.Call[]',
                name: '_calls',
                type: 'tuple[]',
              },
            ],
            name: 'multicall',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ] as const,
        functionName: 'multicall',
        args: [
          [
            {
              proposer: EthAddress.random().toString() as Hex,
              target: rollupAddress.toString() as Hex,
              data: proposeCalldata,
              value: 0n,
              gasLimit: 1000000n,
            },
          ],
        ],
      });

      const tx = {
        input: spireMulticallData,
        blockHash,
        to: SPIRE_PROPOSER_ADDRESS as Hex,
        hash: txHash,
      } as Transaction;

      publicClient.getTransaction.mockResolvedValue(tx);
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result).toBeDefined();
      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Buffer32);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(blockHash);

      // Verify all components are properly decoded
      expect(typeof result.header.inHash).toBe('string');
      expect(typeof result.header.gasFees.feePerDaGas).toBe('bigint');

      // Verify proxy implementation was checked
      expect(publicClient.getStorageAt).toHaveBeenCalled();

      // Verify instrumentation was called with Spire Proposer address
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(SPIRE_PROPOSER_ADDRESS, false);
    });

    it('should succeed via hash matching when multicall3 has unknown calls', async () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as Hex,
        '0x0fedcba987654321fedcba987654321fedcba987654321fedcba987654321fed' as Hex,
      );
      const unknownAddress = EthAddress.random();

      const tx = makeMulticall3Transaction([
        { target: unknownAddress.toString() as Hex, callData: '0x12345678' as Hex },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Buffer32);
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(MULTI_CALL_3_ADDRESS, false);
    });

    it('should succeed via Spire-wrapped multicall3 with unknown calls', async () => {
      const proposeCalldata = makeProposeCalldata();
      const hashes = mockHashComputation(
        '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba' as Hex,
        '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex,
      );
      const unknownAddress = EthAddress.random();

      const multicall3Data = encodeFunctionData({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        args: [
          [
            { target: unknownAddress.toString() as Hex, allowFailure: false, callData: '0x12345678' as Hex },
            { target: rollupAddress.toString() as Hex, allowFailure: false, callData: proposeCalldata },
          ],
        ],
      });

      const spireMulticallData = encodeFunctionData({
        abi: [
          {
            inputs: [
              {
                components: [
                  { internalType: 'address', name: 'proposer', type: 'address' },
                  { internalType: 'address', name: 'target', type: 'address' },
                  { internalType: 'bytes', name: 'data', type: 'bytes' },
                  { internalType: 'uint256', name: 'value', type: 'uint256' },
                  { internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
                ],
                internalType: 'struct IProposerMulticall.Call[]',
                name: '_calls',
                type: 'tuple[]',
              },
            ],
            name: 'multicall',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ] as const,
        functionName: 'multicall',
        args: [
          [
            {
              proposer: EthAddress.random().toString() as Hex,
              target: MULTI_CALL_3_ADDRESS as Hex,
              data: multicall3Data,
              value: 0n,
              gasLimit: 1000000n,
            },
          ],
        ],
      });

      const tx = {
        input: spireMulticallData,
        blockHash,
        to: SPIRE_PROPOSER_ADDRESS as Hex,
        hash: txHash,
      } as Transaction;

      publicClient.getTransaction.mockResolvedValue(tx);
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, hashes);

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(toCheckpointHeader(result.header)).toBeInstanceOf(CheckpointHeader);
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(SPIRE_PROPOSER_ADDRESS, false);
    });

    it('should fall back to trace with wrong hashes and final decode throws mismatch', async () => {
      const proposeCalldata = makeProposeCalldata();
      const wrongHashes = {
        attestationsHash: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        payloadDigest: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
      };
      const unknownAddress = EthAddress.random();

      const tx = makeMulticall3Transaction([
        { target: unknownAddress.toString() as Hex, callData: '0x12345678' as Hex },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      publicClient.getTransaction.mockResolvedValue(tx);

      // Mock trace to return the propose calldata (trace succeeds but final hash validation fails)
      debugClient.request.mockResolvedValueOnce([
        {
          type: 'call',
          action: {
            from: EthAddress.random().toString(),
            to: rollupAddress.toString(),
            callType: 'call',
            input: proposeCalldata,
            value: '0x0',
            gas: '0x5208',
          },
          result: { output: '0x', gasUsed: '0x5208' },
          subtraces: 0,
          traceAddress: [],
        },
      ]);

      await expect(retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, wrongHashes)).rejects.toThrow(
        /hash mismatch/i,
      );
    });
  });
});
