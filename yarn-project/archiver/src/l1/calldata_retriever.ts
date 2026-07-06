import { MULTI_CALL_3_ADDRESS, type ViemCommitteeAttestations, type ViemHeader } from '@aztec/ethereum/contracts';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { LruSet } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { computeCheckpointPayloadDigest } from '@aztec/stdlib/checkpoint';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

import {
  type AbiParameter,
  type Hex,
  type Transaction,
  decodeFunctionData,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  multicall3Abi,
  toFunctionSelector,
} from 'viem';

import type { ArchiverInstrumentation } from '../modules/instrumentation.js';
import { getSuccessfulCallsFromDebug } from './debug_tx.js';
import { getCallsFromSpireProposer } from './spire_proposer.js';
import { getSuccessfulCallsFromTrace } from './trace_tx.js';
import type { CallInfo } from './types.js';

/** Decoded checkpoint data from a propose calldata. */
type CheckpointData = {
  checkpointNumber: CheckpointNumber;
  archiveRoot: Fr;
  header: CheckpointHeader;
  attestations: CommitteeAttestation[];
  /**
   * The exact packed `CommitteeAttestations` tuple as it appears in the propose calldata, preserved
   * verbatim (never re-derived from {@link attestations}) so invalidation evidence stays byte-faithful to
   * the on-chain `attestationsHash`.
   */
  packedAttestations: ViemCommitteeAttestations;
  blockHash: string;
  feeAssetPriceModifier: bigint;
};

/**
 * Extracts calldata to the `propose` method of the rollup contract from an L1 transaction
 * in order to reconstruct an L2 block header. Uses hash matching against expected hashes
 * from the CheckpointProposed event to verify the correct propose calldata.
 */
export class CalldataRetriever {
  /** Tx hashes we've already logged for trace+debug failure (log once per tx per process). */
  private static readonly traceFailureWarnedTxHashes = new LruSet<string>(1000);

  /** Clears the trace-failure warned set. For testing only. */
  static resetTraceFailureWarnedForTesting(): void {
    CalldataRetriever.traceFailureWarnedTxHashes.clear();
  }

  constructor(
    private readonly publicClient: ViemPublicClient,
    private readonly debugClient: ViemPublicDebugClient,
    private readonly targetCommitteeSize: number,
    private readonly instrumentation: ArchiverInstrumentation | undefined,
    private readonly logger: Logger,
    private readonly rollupAddress: EthAddress,
  ) {}

  private getSignatureContext() {
    return {
      chainId: this.publicClient.chain.id,
      rollupAddress: this.rollupAddress,
    };
  }

  /**
   * Gets checkpoint header and metadata from the calldata of an L1 transaction.
   * Tries multicall3 decoding, falls back to trace-based extraction.
   * @param txHash - Hash of the tx that published it.
   * @param blobHashes - Blob hashes for the checkpoint.
   * @param checkpointNumber - Checkpoint number.
   * @param expectedHashes - Expected hashes from the CheckpointProposed event for validation
   * @returns Checkpoint header and metadata from the calldata, deserialized
   */
  async getCheckpointFromRollupTx(
    txHash: `0x${string}`,
    _blobHashes: Buffer[],
    checkpointNumber: CheckpointNumber,
    expectedHashes: {
      attestationsHash: Hex;
      payloadDigest: Hex;
    },
  ): Promise<CheckpointData> {
    this.logger.trace(`Fetching checkpoint ${checkpointNumber} from rollup tx ${txHash}`);
    const tx = await this.publicClient.getTransaction({ hash: txHash });
    return this.getCheckpointFromTx(tx, checkpointNumber, expectedHashes);
  }

  /** Gets checkpoint data from a transaction by trying decode strategies then falling back to trace. */
  protected async getCheckpointFromTx(
    tx: Transaction,
    checkpointNumber: CheckpointNumber,
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
  ): Promise<CheckpointData> {
    // Try to decode as multicall3 with hash-verified matching
    const multicall3Result = this.tryDecodeMulticall3(tx, expectedHashes, checkpointNumber, tx.blockHash!);
    if (multicall3Result) {
      this.logger.trace(`Decoded propose calldata from multicall3 for tx ${tx.hash}`);
      this.instrumentation?.recordBlockProposalTxTarget(tx.to!, false);
      return multicall3Result;
    }

    // Try to decode as direct propose call
    const directResult = this.tryDecodeDirectPropose(tx, expectedHashes, checkpointNumber, tx.blockHash!);
    if (directResult) {
      this.logger.trace(`Decoded propose calldata from direct call for tx ${tx.hash}`);
      this.instrumentation?.recordBlockProposalTxTarget(tx.to!, false);
      return directResult;
    }

    // Try to decode as Spire Proposer multicall wrapper
    const spireResult = await this.tryDecodeSpireProposer(tx, expectedHashes, checkpointNumber, tx.blockHash!);
    if (spireResult) {
      this.logger.trace(`Decoded propose calldata from Spire Proposer for tx ${tx.hash}`);
      this.instrumentation?.recordBlockProposalTxTarget(tx.to!, false);
      return spireResult;
    }

    // Fall back to trace-based extraction
    this.logger.warn(
      `Failed to decode multicall3, direct propose, or Spire proposer for L1 tx ${tx.hash}, falling back to trace for checkpoint ${checkpointNumber}`,
    );
    this.instrumentation?.recordBlockProposalTxTarget(tx.to ?? EthAddress.ZERO.toString(), true);
    const tracedCalldata = await this.extractCalldataViaTrace(tx.hash);
    const tracedResult = this.tryDecodeAndVerifyPropose(
      tracedCalldata,
      expectedHashes,
      checkpointNumber,
      tx.blockHash!,
    );
    if (!tracedResult) {
      throw new Error(`Hash mismatch for traced propose calldata in tx ${tx.hash} for checkpoint ${checkpointNumber}`);
    }
    return tracedResult;
  }

  /**
   * Attempts to decode a transaction as a Spire Proposer multicall wrapper.
   * If successful, iterates all wrapped calls and validates each as either multicall3
   * or direct propose, verifying against expected hashes.
   * @param tx - The transaction to decode
   * @param expectedHashes - Expected hashes for hash-verified matching
   * @param checkpointNumber - The checkpoint number
   * @param blockHash - The L1 block hash
   * @returns The checkpoint data if successfully decoded and validated, undefined otherwise
   */
  protected async tryDecodeSpireProposer(
    tx: Transaction,
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ): Promise<CheckpointData | undefined> {
    // Try to decode as Spire Proposer multicall (extracts all wrapped calls)
    const spireWrappedCalls = await getCallsFromSpireProposer(tx, this.publicClient, this.logger);
    if (!spireWrappedCalls) {
      return undefined;
    }

    this.logger.trace(`Decoded Spire Proposer wrapping for tx ${tx.hash}, ${spireWrappedCalls.length} inner call(s)`);

    // Try each wrapped call as either multicall3 or direct propose
    for (const spireWrappedCall of spireWrappedCalls) {
      const wrappedTx = { to: spireWrappedCall.to, input: spireWrappedCall.data, hash: tx.hash };

      const multicall3Result = this.tryDecodeMulticall3(wrappedTx, expectedHashes, checkpointNumber, blockHash);
      if (multicall3Result) {
        this.logger.trace(`Decoded propose calldata from Spire Proposer to multicall3 for tx ${tx.hash}`);
        return multicall3Result;
      }

      const directResult = this.tryDecodeDirectPropose(wrappedTx, expectedHashes, checkpointNumber, blockHash);
      if (directResult) {
        this.logger.trace(`Decoded propose calldata from Spire Proposer to direct propose for tx ${tx.hash}`);
        return directResult;
      }
    }

    this.logger.warn(
      `Spire Proposer wrapped calls could not be decoded as multicall3 or direct propose for tx ${tx.hash}`,
    );
    return undefined;
  }

  /**
   * Attempts to decode transaction input as multicall3 and extract propose calldata.
   * Finds all calls matching the rollup address and propose selector, then decodes
   * and verifies each candidate against expected hashes from the CheckpointProposed event.
   * @param tx - The transaction-like object with to, input, and hash
   * @param expectedHashes - Expected hashes from CheckpointProposed event
   * @param checkpointNumber - The checkpoint number
   * @param blockHash - The L1 block hash
   * @returns The checkpoint data if successfully validated, undefined otherwise
   */
  protected tryDecodeMulticall3(
    tx: { to: Hex | null | undefined; input: Hex; hash: Hex },
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ): CheckpointData | undefined {
    const txHash = tx.hash;

    try {
      // Check if transaction is to Multicall3 address
      if (!tx.to || !EthAddress.areEqual(tx.to, MULTI_CALL_3_ADDRESS)) {
        this.logger.debug(`Transaction is not to Multicall3 address (to: ${tx.to})`, { txHash, to: tx.to });
        return undefined;
      }

      // Try to decode as multicall3 aggregate3 call
      const { functionName: multicall3Fn, args: multicall3Args } = decodeFunctionData({
        abi: multicall3Abi,
        data: tx.input,
      });

      // If not aggregate3, return undefined (not a multicall3 transaction)
      if (multicall3Fn !== 'aggregate3') {
        this.logger.warn(`Transaction is not multicall3 aggregate3 (got ${multicall3Fn})`, { txHash });
        return undefined;
      }

      if (multicall3Args.length !== 1) {
        this.logger.warn(`Unexpected number of arguments for multicall3 (got ${multicall3Args.length})`, { txHash });
        return undefined;
      }

      const [calls] = multicall3Args;

      // Find all calls matching rollup address + propose selector
      const rollupAddressLower = this.rollupAddress.toString().toLowerCase();
      const proposeSelectorLower = PROPOSE_SELECTOR.toLowerCase();
      const candidates: Hex[] = [];

      for (const call of calls) {
        const addr = call.target.toLowerCase();
        const callData = call.callData;

        if (callData.length < 10) {
          continue;
        }

        const selector = callData.slice(0, 10).toLowerCase();
        if (addr === rollupAddressLower && selector === proposeSelectorLower) {
          candidates.push(callData);
        }
      }

      if (candidates.length === 0) {
        this.logger.debug(`No propose candidates found in multicall3`, { txHash });
        return undefined;
      }

      // Decode, verify, and build for each candidate
      const verified: CheckpointData[] = [];
      for (const candidate of candidates) {
        const result = this.tryDecodeAndVerifyPropose(candidate, expectedHashes, checkpointNumber, blockHash);
        if (result) {
          verified.push(result);
        }
      }

      if (verified.length === 1) {
        this.logger.trace(`Verified single propose candidate via hash matching`, { txHash });
        return verified[0];
      }

      if (verified.length > 1) {
        this.logger.warn(
          `Multiple propose candidates verified (${verified.length}), returning first (identical data)`,
          { txHash },
        );
        return verified[0];
      }

      this.logger.debug(`No candidates verified against expected hashes`, { txHash });
      return undefined;
    } catch (err) {
      // Any decoding error triggers fallback to trace
      this.logger.warn(`Failed to decode multicall3: ${err}`, { txHash });
      return undefined;
    }
  }

  /**
   * Attempts to decode transaction as a direct propose call to the rollup contract.
   * Decodes, verifies hashes, and builds checkpoint data in a single pass.
   * @param tx - The transaction-like object with to, input, and hash
   * @param expectedHashes - Expected hashes from CheckpointProposed event
   * @param checkpointNumber - The checkpoint number
   * @param blockHash - The L1 block hash
   * @returns The checkpoint data if successfully validated, undefined otherwise
   */
  protected tryDecodeDirectPropose(
    tx: { to: Hex | null | undefined; input: Hex; hash: Hex },
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ): CheckpointData | undefined {
    const txHash = tx.hash;
    try {
      // Check if transaction is to the rollup address
      if (!tx.to || !EthAddress.areEqual(tx.to, this.rollupAddress)) {
        this.logger.debug(`Transaction is not to rollup address (to: ${tx.to})`, { txHash });
        return undefined;
      }

      // Validate it's a propose call before full decode+verify
      const { functionName } = decodeFunctionData({ abi: RollupAbi, data: tx.input });
      if (functionName !== 'propose') {
        this.logger.warn(`Transaction to rollup is not propose (got ${functionName})`, { txHash });
        return undefined;
      }

      // Decode, verify hashes, and build checkpoint data
      this.logger.trace(`Validated direct propose call to rollup`, { txHash });
      return this.tryDecodeAndVerifyPropose(tx.input, expectedHashes, checkpointNumber, blockHash);
    } catch (err) {
      // Any decoding error means it's not a valid propose call
      this.logger.warn(`Failed to decode as direct propose: ${err}`, { txHash });
      return undefined;
    }
  }

  /**
   * Uses debug/trace RPC to extract the actual calldata from the successful propose call.
   * This is the definitive fallback that works for any transaction pattern.
   * Tries trace_transaction first, then falls back to debug_traceTransaction.
   * @param txHash - The transaction hash to trace
   * @returns The propose calldata from the successful call
   */
  protected async extractCalldataViaTrace(txHash: Hex): Promise<Hex> {
    const rollupAddress = this.rollupAddress;
    const selector = PROPOSE_SELECTOR;

    let calls: CallInfo[];
    try {
      // Try trace_transaction first (using Parity/OpenEthereum/Erigon RPC)
      this.logger.debug(`Attempting to trace transaction ${txHash} using trace_transaction`);
      calls = await getSuccessfulCallsFromTrace(this.debugClient, txHash, rollupAddress, selector, this.logger);
      this.logger.debug(`Successfully traced using trace_transaction, found ${calls.length} calls`);
    } catch (err) {
      const traceError = err instanceof Error ? err : new Error(String(err));
      this.logger.verbose(`Failed trace_transaction for ${txHash}: ${traceError.message}`);
      this.logger.debug(`Trace failure details for ${txHash}`, { traceError });

      try {
        // Fall back to debug_traceTransaction (Geth RPC)
        this.logger.debug(`Attempting to trace transaction ${txHash} using debug_traceTransaction`);
        calls = await getSuccessfulCallsFromDebug(this.debugClient, txHash, rollupAddress, selector, this.logger);
        this.logger.debug(`Successfully traced using debug_traceTransaction, found ${calls.length} calls`);
      } catch (debugErr) {
        const debugError = debugErr instanceof Error ? debugErr : new Error(String(debugErr));
        // Log once per tx so we don't spam on every sync cycle when sync point doesn't advance
        if (!CalldataRetriever.traceFailureWarnedTxHashes.has(txHash)) {
          CalldataRetriever.traceFailureWarnedTxHashes.add(txHash);
          this.logger.warn(
            `Cannot decode L1 tx ${txHash}: trace and debug RPC failed or unavailable. ` +
              `trace_transaction: ${traceError.message}; debug_traceTransaction: ${debugError.message}`,
          );
        }
        // Full error objects can be very long; keep at debug only
        this.logger.debug(`Trace/debug failure details for tx ${txHash}`, {
          traceError,
          debugError,
          txHash,
        });
        throw new Error(`Failed to trace transaction ${txHash} to extract propose calldata`);
      }
    }

    // Validate exactly ONE successful propose call
    if (calls.length === 0) {
      throw new Error(`No successful propose calls found in transaction ${txHash}`);
    }

    if (calls.length > 1) {
      throw new Error(`Multiple successful propose calls found in transaction ${txHash} (${calls.length})`);
    }

    // Return the calldata from the single successful propose call
    return calls[0].input;
  }

  /**
   * Decodes propose calldata, verifies against expected hashes, and builds checkpoint data.
   * Returns undefined on decode errors or hash mismatches (soft failure for try-based callers).
   * @param proposeCalldata - The propose function calldata
   * @param expectedHashes - Expected hashes from the CheckpointProposed event
   * @param checkpointNumber - The checkpoint number
   * @param blockHash - The L1 block hash
   * @returns The decoded checkpoint data, or undefined on failure
   */
  protected tryDecodeAndVerifyPropose(
    proposeCalldata: Hex,
    expectedHashes: { attestationsHash: Hex; payloadDigest: Hex },
    checkpointNumber: CheckpointNumber,
    blockHash: Hex,
  ): CheckpointData | undefined {
    try {
      const { functionName, args } = decodeFunctionData({ abi: RollupAbi, data: proposeCalldata });
      if (functionName !== 'propose') {
        return undefined;
      }

      const [decodedArgs, packedAttestations] = args! as readonly [
        { archive: Hex; oracleInput: { feeAssetPriceModifier: bigint }; header: ViemHeader },
        ViemCommitteeAttestations,
        ...unknown[],
      ];

      // Verify attestationsHash
      const computedAttestationsHash = this.computeAttestationsHash(packedAttestations);
      if (
        !Buffer.from(hexToBytes(computedAttestationsHash)).equals(
          Buffer.from(hexToBytes(expectedHashes.attestationsHash)),
        )
      ) {
        this.logger.warn(`Attestations hash mismatch during verification`, {
          computed: computedAttestationsHash,
          expected: expectedHashes.attestationsHash,
        });
        return undefined;
      }

      // Verify payloadDigest
      const header = CheckpointHeader.fromViem(decodedArgs.header);
      const archiveRoot = new Fr(Buffer.from(hexToBytes(decodedArgs.archive)));
      const feeAssetPriceModifier = decodedArgs.oracleInput.feeAssetPriceModifier;
      const computedPayloadDigest = this.computePayloadDigest(header, archiveRoot, feeAssetPriceModifier);
      if (
        !Buffer.from(hexToBytes(computedPayloadDigest)).equals(Buffer.from(hexToBytes(expectedHashes.payloadDigest)))
      ) {
        this.logger.warn(`Payload digest mismatch during verification`, {
          computed: computedPayloadDigest,
          expected: expectedHashes.payloadDigest,
        });
        return undefined;
      }

      const attestations = CommitteeAttestation.fromPacked(packedAttestations, this.targetCommitteeSize);

      this.logger.trace(`Validated and decoded propose calldata for checkpoint ${checkpointNumber}`, {
        checkpointNumber,
        archive: decodedArgs.archive,
        header: decodedArgs.header,
        l1BlockHash: blockHash,
        attestations,
        packedAttestations,
        targetCommitteeSize: this.targetCommitteeSize,
      });

      return {
        checkpointNumber,
        archiveRoot,
        header,
        attestations,
        packedAttestations,
        blockHash,
        feeAssetPriceModifier,
      };
    } catch {
      return undefined;
    }
  }

  /** Computes the keccak256 hash of ABI-encoded CommitteeAttestations. */
  private computeAttestationsHash(packedAttestations: ViemCommitteeAttestations): Hex {
    return keccak256(encodeAbiParameters([this.getCommitteeAttestationsStructDef()], [packedAttestations]));
  }

  /** Computes the keccak256 payload digest from the checkpoint header, archive root, and fee asset price modifier. */
  private computePayloadDigest(header: CheckpointHeader, archiveRoot: Fr, feeAssetPriceModifier: bigint): Hex {
    return computeCheckpointPayloadDigest({
      header,
      archiveRoot,
      feeAssetPriceModifier,
      signatureContext: this.getSignatureContext(),
    }).toString();
  }

  /**
   * Extracts the CommitteeAttestations struct definition from RollupAbi.
   * Finds the _attestations parameter by name in the propose function.
   */
  private getCommitteeAttestationsStructDef(): AbiParameter {
    const proposeFunction = RollupAbi.find(item => item.type === 'function' && item.name === 'propose') as
      | { type: 'function'; name: string; inputs: readonly AbiParameter[] }
      | undefined;

    if (!proposeFunction) {
      throw new Error('propose function not found in RollupAbi');
    }

    // Find the _attestations parameter by name, not by index
    const attestationsParam = proposeFunction.inputs.find(param => param.name === '_attestations');

    if (!attestationsParam) {
      throw new Error('_attestations parameter not found in propose function');
    }

    if (attestationsParam.type !== 'tuple') {
      throw new Error(`Expected _attestations parameter to be a tuple, got ${attestationsParam.type}`);
    }

    // Extract the tuple components (struct fields)
    const tupleParam = attestationsParam as unknown as {
      type: 'tuple';
      components?: readonly AbiParameter[];
    };

    return {
      type: 'tuple',
      components: tupleParam.components || [],
    } as AbiParameter;
  }
}

/** Function selector for the `propose` method of the rollup contract. */
const PROPOSE_SELECTOR = toFunctionSelector(RollupAbi.find(x => x.type === 'function' && x.name === 'propose')!);
