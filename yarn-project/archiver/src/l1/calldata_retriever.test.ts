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
import { GasFees } from '@aztec/stdlib/gas';
import { ConsensusPayload, SignatureDomainSeparator } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

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
  getCallFromSpireProposer,
  verifyProxyImplementation,
} from './spire_proposer.js';

/**
 * Test class that exposes protected methods for testing
 */
class TestCalldataRetriever extends CalldataRetriever {
  public override tryDecodeMulticall3(tx: Transaction): Hex | undefined {
    return super.tryDecodeMulticall3(tx);
  }

  public override tryDecodeDirectPropose(tx: Transaction): Hex | undefined {
    return super.tryDecodeDirectPropose(tx);
  }

  public override async extractCalldataViaTrace(txHash: Hex): Promise<Hex> {
    return await super.extractCalldataViaTrace(txHash);
  }

  public override decodeAndBuildCheckpoint(
    proposeCalldata: Hex,
    blockHash: Hex,
    checkpointNumber: CheckpointNumber,
    expectedHashes: { attestationsHash?: Hex; payloadDigest?: Hex },
  ) {
    return super.decodeAndBuildCheckpoint(proposeCalldata, blockHash, checkpointNumber, expectedHashes);
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
  const governanceProposerAddress = EthAddress.random();
  const slashFactoryAddress = EthAddress.random();
  const slashingProposerAddress = EthAddress.random();
  const blockHash = Buffer32.random().toString();

  beforeEach(() => {
    txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    publicClient = mock<ViemPublicClient>();
    debugClient = mock<ViemPublicDebugClient>();
    logger = createLogger('test:calldata_retriever');
    instrumentation = mock<ArchiverInstrumentation>();

    retriever = new TestCalldataRetriever(publicClient, debugClient, TARGET_COMMITTEE_SIZE, instrumentation, logger, {
      rollupAddress,
      governanceProposerAddress,
      slashFactoryAddress,
      slashingProposerAddress,
    });
  });

  function makeViemHeader(): ViemHeader {
    return CheckpointHeader.random().toViem();
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
    const checkpointNumber = CheckpointNumber(42);

    it('should successfully decode valid multicall3 transaction', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {});

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Fr);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(tx.blockHash);
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(MULTI_CALL_3_ADDRESS, false);
    });

    it('should fall back to direct propose when multicall3 decoding fails', async () => {
      const proposeCalldata = makeProposeCalldata();

      // Transaction that's not multicall3 but is a direct propose call
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        blockHash,
        hash: txHash,
      } as Transaction;

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {});

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(rollupAddress.toString(), false);
    });

    it('should fall back to trace when both multicall3 and direct propose fail', async () => {
      const proposeCalldata = makeProposeCalldata();

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

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {});

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(debugClient.request).toHaveBeenCalledWith({ method: 'trace_transaction', params: [txHash] });
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(wrongAddress.toString(), true);
    });

    it('should throw when tracing fails', async () => {
      const proposeCalldata = makeProposeCalldata();

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

      await expect(retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {})).rejects.toThrow(
        'Failed to trace transaction',
      );
    });

    it('should throw when transaction retrieval fails', async () => {
      publicClient.getTransaction.mockRejectedValue(new Error('Transaction not found'));

      await expect(retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {})).rejects.toThrow(
        'Transaction not found',
      );
    });

    it('should validate attestationsHash when provided', async () => {
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

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
        attestationsHash: expectedAttestationsHash,
      });

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
    });

    it('should throw when attestationsHash does not match', async () => {
      const attestations = makeViemCommitteeAttestations();
      const proposeCalldata = makeProposeCalldata(undefined, attestations);
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      // Use a different (wrong) attestationsHash
      const wrongAttestationsHash = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      await expect(
        retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
          attestationsHash: wrongAttestationsHash,
        }),
      ).rejects.toThrow('Attestations hash mismatch');
    });

    it('should work with empty expectedHashes for backwards compatibility', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      // Call with empty expectedHashes (simulating old event format without hash fields)
      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {});

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
      // Should succeed without validation when hashes are not provided
    });

    it('should validate payloadDigest when provided', async () => {
      const header = makeViemHeader();
      const attestations = makeViemCommitteeAttestations();
      const archiveRoot = Fr.random();
      const archive = archiveRoot.toString() as Hex;
      const feeAssetPriceModifier = BigInt(0);

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

      // Compute the expected payloadDigest using ConsensusPayload (same logic as the validator)
      const checkpointHeader = CheckpointHeader.fromViem(header);
      const consensusPayload = new ConsensusPayload(checkpointHeader, archiveRoot);
      const payloadToSign = consensusPayload.getPayloadToSign(SignatureDomainSeparator.checkpointAttestation);
      const expectedPayloadDigest = keccak256(payloadToSign);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
        payloadDigest: expectedPayloadDigest,
      });

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
    });

    it('should throw when payloadDigest does not match', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString(), callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      // Use a different (wrong) payloadDigest
      const wrongPayloadDigest = '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex;

      await expect(
        retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {
          payloadDigest: wrongPayloadDigest,
        }),
      ).rejects.toThrow('Payload digest mismatch');
    });
  });
  describe('tryDecodeMulticall3', () => {
    it('should decode simple multicall3 with single propose call', () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString() as Hex, callData: proposeCalldata }]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBe(proposeCalldata);
    });

    it('should decode multicall3 with propose and other rollup calls', () => {
      const proposeCalldata = makeProposeCalldata();
      // Use the actual selector for these functions
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex; // Minimal valid calldata

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: invalidateBadCalldata },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBe(proposeCalldata);
    });

    it('should decode multicall3 with mixed valid calls', () => {
      const proposeCalldata = makeProposeCalldata();
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: invalidateBadCalldata },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBe(proposeCalldata);
    });

    it('should return undefined when not to multicall3 address', () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when to is null', () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: null,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when not multicall3 aggregate3', () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: MULTI_CALL_3_ADDRESS as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when call to unknown address', () => {
      const proposeCalldata = makeProposeCalldata();
      const unknownAddress = EthAddress.random();

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
        { target: unknownAddress.toString() as Hex, callData: '0x12345678' as Hex },
      ]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when unknown function selector on rollup', () => {
      const proposeCalldata = makeProposeCalldata();
      const invalidCalldata = '0x99999999' as Hex; // Unknown selector

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata },
        { target: rollupAddress.toString() as Hex, callData: invalidCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when no propose calls found', () => {
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: invalidateBadCalldata },
      ]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when multiple propose calls', () => {
      const proposeCalldata1 = makeProposeCalldata();
      const proposeCalldata2 = makeProposeCalldata();

      const tx = makeMulticall3Transaction([
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata1 },
        { target: rollupAddress.toString() as Hex, callData: proposeCalldata2 },
      ]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when calldata too short', () => {
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString() as Hex, callData: '0x123' as Hex }]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when empty calls array', () => {
      const tx = makeMulticall3Transaction([]);

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when decoding throws exception', () => {
      const tx = {
        input: '0xinvalid' as Hex,
        to: MULTI_CALL_3_ADDRESS as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeMulticall3(tx);

      expect(result).toBeUndefined();
    });
  });

  describe('tryDecodeDirectPropose', () => {
    it('should decode direct propose call to rollup', () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
        blockHash: Buffer32.random().toString() as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx);

      expect(result).toBe(proposeCalldata);
    });

    it('should return undefined when not to rollup address', () => {
      const proposeCalldata = makeProposeCalldata();
      const wrongAddress = EthAddress.random();
      const tx = {
        input: proposeCalldata,
        to: wrongAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when to is null', () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: null,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when function is not propose', () => {
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidateBadCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      const tx = {
        input: invalidateBadCalldata,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx);

      expect(result).toBeUndefined();
    });

    it('should return undefined when input cannot be decoded', () => {
      const tx = {
        input: '0xinvalid' as Hex,
        to: rollupAddress.toString() as Hex,
        hash: '0x123' as Hex,
      } as Transaction;

      const result = retriever.tryDecodeDirectPropose(tx);

      expect(result).toBeUndefined();
    });
  });

  describe('tryDecodeSpireProposer', () => {
    function makeSpireProposerMulticallTransaction(call: { target: Hex; data: Hex }): Transaction {
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
              target: call.target,
              data: call.data,
              value: 0n,
              gasLimit: 1000000n,
            },
          ],
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
      const tx = makeSpireProposerMulticallTransaction({
        target: rollupAddress.toString() as Hex,
        data: proposeCalldata,
      });

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeDefined();
      expect(result?.to.toLowerCase()).toBe(rollupAddress.toString().toLowerCase());
      expect(result?.data).toBe(proposeCalldata);
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

      const tx = makeSpireProposerMulticallTransaction({
        target: MULTI_CALL_3_ADDRESS as Hex,
        data: multicall3Data,
      });

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeDefined();
      expect(result?.to).toBe(MULTI_CALL_3_ADDRESS);
      expect(result?.data).toBe(multicall3Data);
    });

    it('should return undefined when not to Spire Proposer address', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = {
        input: proposeCalldata,
        to: rollupAddress.toString() as Hex,
        hash: txHash,
      } as Transaction;

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeUndefined();
      expect(publicClient.getStorageAt).not.toHaveBeenCalled();
    });

    it('should return undefined when proxy implementation verification fails', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeSpireProposerMulticallTransaction({
        target: rollupAddress.toString() as Hex,
        data: proposeCalldata,
      });

      // Mock the proxy pointing to wrong implementation
      publicClient.getStorageAt.mockResolvedValue('0x000000000000000000000000wrongimplementation0000000000' as Hex);

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeUndefined();
    });

    it('should return undefined when Spire Proposer contains multiple calls', async () => {
      const proposeCalldata = makeProposeCalldata();
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

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      expect(result).toBeUndefined();
    });

    it('should extract call even if target is unknown (validation happens in next step)', async () => {
      const unknownAddress = EthAddress.random();
      const tx = makeSpireProposerMulticallTransaction({
        target: unknownAddress.toString() as Hex,
        data: '0x12345678' as Hex,
      });

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      // Spire proposer should successfully extract the call, even if target is unknown
      // The validation of the target happens in the next step (tryDecodeMulticall3 or tryDecodeDirectPropose)
      expect(result).toBeDefined();
      expect(result?.to.toLowerCase()).toBe(unknownAddress.toString().toLowerCase());
      expect(result?.data).toBe('0x12345678');
    });

    it('should extract multicall3 call (validation of inner calls happens in next step)', async () => {
      const proposeCalldata = makeProposeCalldata();
      const invalidCalldata = '0x99999999' as Hex; // Unknown selector

      const multicall3Data = encodeFunctionData({
        abi: multicall3Abi,
        functionName: 'aggregate3',
        args: [
          [
            { target: rollupAddress.toString() as Hex, allowFailure: false, callData: proposeCalldata },
            { target: rollupAddress.toString() as Hex, allowFailure: false, callData: invalidCalldata },
          ],
        ],
      });

      const tx = makeSpireProposerMulticallTransaction({
        target: MULTI_CALL_3_ADDRESS as Hex,
        data: multicall3Data,
      });

      // Mock the proxy implementation verification
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await getCallFromSpireProposer(tx, publicClient, logger);

      // Spire proposer should successfully extract the multicall3 call
      // Validation of the inner calls happens in tryDecodeMulticall3
      expect(result).toBeDefined();
      expect(result?.to).toBe(MULTI_CALL_3_ADDRESS);
      expect(result?.data).toBe(multicall3Data);
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
      debugClient.request.mockRejectedValueOnce(new Error('trace_transaction not supported'));

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

  describe('decodeAndBuildCheckpoint', () => {
    const blockHash = Fr.random().toString() as Hex;
    const checkpointNumber = CheckpointNumber(42);

    it('should correctly decode propose calldata and build checkpoint', () => {
      const proposeCalldata = makeProposeCalldata();

      const result = retriever.decodeAndBuildCheckpoint(proposeCalldata, blockHash, checkpointNumber, {});

      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Fr);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(blockHash);
    });

    it('should handle attestations correctly', () => {
      const attestations = makeViemCommitteeAttestations();
      const proposeCalldata = makeProposeCalldata(undefined, attestations);

      const result = retriever.decodeAndBuildCheckpoint(proposeCalldata, blockHash, checkpointNumber, {});

      expect(result.attestations).toHaveLength(TARGET_COMMITTEE_SIZE);
    });

    it('should throw when calldata is not for propose function', () => {
      const invalidateBadSelector = toFunctionSelector(
        RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
      );
      const invalidCalldata = (invalidateBadSelector + '0'.repeat(120)) as Hex;

      expect(() => retriever.decodeAndBuildCheckpoint(invalidCalldata, blockHash, checkpointNumber, {})).toThrow();
    });

    it('should throw when calldata is malformed', () => {
      const malformedCalldata = '0xinvalid' as Hex;

      expect(() => retriever.decodeAndBuildCheckpoint(malformedCalldata, blockHash, checkpointNumber, {})).toThrow();
    });
  });

  describe('integration', () => {
    const checkpointNumber = CheckpointNumber(42);

    it('should complete full flow from tx hash to checkpoint via multicall3', async () => {
      const proposeCalldata = makeProposeCalldata();
      const tx = makeMulticall3Transaction([{ target: rollupAddress.toString() as Hex, callData: proposeCalldata }]);

      publicClient.getTransaction.mockResolvedValue(tx);

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {});

      expect(result).toBeDefined();
      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Fr);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(tx.blockHash);

      // Verify all components are properly decoded
      expect(result.header.inHash).toBeInstanceOf(Fr);
      expect(result.header.gasFees).toBeInstanceOf(GasFees);

      // Verify instrumentation was called
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(MULTI_CALL_3_ADDRESS, false);
    });

    it('should complete full flow from tx hash to checkpoint via Spire Proposer', async () => {
      const SPIRE_PROPOSER_ADDRESS = '0x9ccc2f3ecde026230e11a5c8799ac7524f2bb294';
      const SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION = '0x7d38d47e7c82195e6e607d3b0f1c20c615c7bf42';

      const proposeCalldata = makeProposeCalldata();

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

      const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, {});

      expect(result).toBeDefined();
      expect(result.checkpointNumber).toBe(checkpointNumber);
      expect(result.header).toBeInstanceOf(CheckpointHeader);
      expect(result.archiveRoot).toBeInstanceOf(Fr);
      expect(Array.isArray(result.attestations)).toBe(true);
      expect(result.blockHash).toBe(blockHash);

      // Verify all components are properly decoded
      expect(result.header.inHash).toBeInstanceOf(Fr);
      expect(result.header.gasFees).toBeInstanceOf(GasFees);

      // Verify proxy implementation was checked
      expect(publicClient.getStorageAt).toHaveBeenCalled();

      // Verify instrumentation was called with Spire Proposer address
      expect(instrumentation.recordBlockProposalTxTarget).toHaveBeenCalledWith(SPIRE_PROPOSER_ADDRESS, false);
    });
  });
});
