import { MULTI_CALL_3_ADDRESS, type ViemCommitteeAttestations, type ViemHeader } from '@aztec/ethereum/contracts';
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ViemSignature } from '@aztec/foundation/eth-signature';
import type { Logger } from '@aztec/foundation/log';
import {
  EmpireSlashingProposerAbi,
  GovernanceProposerAbi,
  RollupAbi,
  SlashFactoryAbi,
  TallySlashingProposerAbi,
} from '@aztec/l1-artifacts';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { ConsensusPayload, SignatureDomainSeparator } from '@aztec/stdlib/p2p';
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

import type { ArchiverInstrumentation } from '../instrumentation.js';
import { getSuccessfulCallsFromDebug } from './debug_tx.js';
import { getCallFromSpireProposer } from './spire_proposer.js';
import { getSuccessfulCallsFromTrace } from './trace_tx.js';
import type { CallInfo } from './types.js';

/**
 * Extracts calldata to the `propose` method of the rollup contract from an L1 transaction
 * in order to reconstruct an L2 block header.
 */
export class CalldataRetriever {
  /** Pre-computed valid contract calls for validation */
  private readonly validContractCalls: ValidContractCall[];

  private readonly rollupAddress: EthAddress;

  constructor(
    private readonly publicClient: ViemPublicClient,
    private readonly debugClient: ViemPublicDebugClient,
    private readonly targetCommitteeSize: number,
    private readonly instrumentation: ArchiverInstrumentation | undefined,
    private readonly logger: Logger,
    contractAddresses: {
      rollupAddress: EthAddress;
      governanceProposerAddress: EthAddress;
      slashingProposerAddress: EthAddress;
      slashFactoryAddress?: EthAddress;
    },
  ) {
    this.rollupAddress = contractAddresses.rollupAddress;
    this.validContractCalls = computeValidContractCalls(contractAddresses);
  }

  /**
   * Gets checkpoint header and metadata from the calldata of an L1 transaction.
   * Tries multicall3 decoding, falls back to trace-based extraction.
   * @param txHash - Hash of the tx that published it.
   * @param blobHashes - Blob hashes for the checkpoint.
   * @param checkpointNumber - Checkpoint number.
   * @param expectedHashes - Optional expected hashes from the CheckpointProposed event for validation
   * @returns Checkpoint header and metadata from the calldata, deserialized
   */
  async getCheckpointFromRollupTx(
    txHash: `0x${string}`,
    _blobHashes: Buffer[],
    checkpointNumber: CheckpointNumber,
    expectedHashes: {
      attestationsHash?: Hex;
      payloadDigest?: Hex;
    },
  ): Promise<{
    checkpointNumber: CheckpointNumber;
    archiveRoot: Fr;
    header: CheckpointHeader;
    attestations: CommitteeAttestation[];
    blockHash: string;
  }> {
    this.logger.trace(`Fetching checkpoint ${checkpointNumber} from rollup tx ${txHash}`, {
      willValidateHashes: !!expectedHashes.attestationsHash || !!expectedHashes.payloadDigest,
      hasAttestationsHash: !!expectedHashes.attestationsHash,
      hasPayloadDigest: !!expectedHashes.payloadDigest,
    });
    const tx = await this.publicClient.getTransaction({ hash: txHash });
    const proposeCalldata = await this.getProposeCallData(tx, checkpointNumber);
    return this.decodeAndBuildCheckpoint(proposeCalldata, tx.blockHash!, checkpointNumber, expectedHashes);
  }

  /** Gets rollup propose calldata from a transaction */
  protected async getProposeCallData(tx: Transaction, checkpointNumber: CheckpointNumber): Promise<Hex> {
    // Try to decode as multicall3 with validation
    const proposeCalldata = this.tryDecodeMulticall3(tx);
    if (proposeCalldata) {
      this.logger.trace(`Decoded propose calldata from multicall3 for tx ${tx.hash}`);
      this.instrumentation?.recordBlockProposalTxTarget(tx.to!, false);
      return proposeCalldata;
    }

    // Try to decode as direct propose call
    const directProposeCalldata = this.tryDecodeDirectPropose(tx);
    if (directProposeCalldata) {
      this.logger.trace(`Decoded propose calldata from direct call for tx ${tx.hash}`);
      this.instrumentation?.recordBlockProposalTxTarget(tx.to!, false);
      return directProposeCalldata;
    }

    // Try to decode as Spire Proposer multicall wrapper
    const spireProposeCalldata = await this.tryDecodeSpireProposer(tx);
    if (spireProposeCalldata) {
      this.logger.trace(`Decoded propose calldata from Spire Proposer for tx ${tx.hash}`);
      this.instrumentation?.recordBlockProposalTxTarget(tx.to!, false);
      return spireProposeCalldata;
    }

    // Fall back to trace-based extraction
    this.logger.warn(
      `Failed to decode multicall3, direct propose, or Spire proposer for L1 tx ${tx.hash}, falling back to trace for checkpoint ${checkpointNumber}`,
    );
    this.instrumentation?.recordBlockProposalTxTarget(tx.to ?? EthAddress.ZERO.toString(), true);
    return await this.extractCalldataViaTrace(tx.hash);
  }

  /**
   * Attempts to decode a transaction as a Spire Proposer multicall wrapper.
   * If successful, extracts the wrapped call and validates it as either multicall3 or direct propose.
   * @param tx - The transaction to decode
   * @returns The propose calldata if successfully decoded and validated, undefined otherwise
   */
  protected async tryDecodeSpireProposer(tx: Transaction): Promise<Hex | undefined> {
    // Try to decode as Spire Proposer multicall (extracts the wrapped call)
    const spireWrappedCall = await getCallFromSpireProposer(tx, this.publicClient, this.logger);
    if (!spireWrappedCall) {
      return undefined;
    }

    this.logger.trace(`Decoded Spire Proposer wrapping for tx ${tx.hash}, inner call to ${spireWrappedCall.to}`);

    // Now try to decode the wrapped call as either multicall3 or direct propose
    const wrappedTx = { to: spireWrappedCall.to, input: spireWrappedCall.data, hash: tx.hash };

    const multicall3Calldata = this.tryDecodeMulticall3(wrappedTx);
    if (multicall3Calldata) {
      this.logger.trace(`Decoded propose calldata from Spire Proposer to multicall3 for tx ${tx.hash}`);
      return multicall3Calldata;
    }

    const directProposeCalldata = this.tryDecodeDirectPropose(wrappedTx);
    if (directProposeCalldata) {
      this.logger.trace(`Decoded propose calldata from Spire Proposer to direct propose for tx ${tx.hash}`);
      return directProposeCalldata;
    }

    this.logger.warn(
      `Spire Proposer wrapped call could not be decoded as multicall3 or direct propose for tx ${tx.hash}`,
    );
    return undefined;
  }

  /**
   * Attempts to decode transaction input as multicall3 and extract propose calldata.
   * Returns undefined if validation fails.
   * @param tx - The transaction-like object with to, input, and hash
   * @returns The propose calldata if successfully validated, undefined otherwise
   */
  protected tryDecodeMulticall3(tx: { to: Hex | null | undefined; input: Hex; hash: Hex }): Hex | undefined {
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

      // Validate all calls and find propose calls
      const rollupAddressLower = this.rollupAddress.toString().toLowerCase();
      const proposeCalls: Hex[] = [];

      for (let i = 0; i < calls.length; i++) {
        const addr = calls[i].target.toLowerCase();
        const callData = calls[i].callData;

        // Extract function selector (first 4 bytes)
        if (callData.length < 10) {
          // "0x" + 8 hex chars = 10 chars minimum for a valid function call
          this.logger.warn(`Invalid calldata length at index ${i} (${callData.length})`, { txHash });
          return undefined;
        }
        const functionSelector = callData.slice(0, 10) as Hex;

        // Validate this call is allowed by searching through valid calls
        const validCall = this.validContractCalls.find(
          vc => vc.address === addr && vc.functionSelector === functionSelector,
        );

        if (!validCall) {
          this.logger.warn(`Invalid contract call detected in multicall3`, {
            index: i,
            targetAddress: addr,
            functionSelector,
            validCalls: this.validContractCalls.map(c => ({ address: c.address, selector: c.functionSelector })),
            txHash,
          });
          return undefined;
        }

        this.logger.trace(`Valid call found to ${addr}`, { validCall });

        // Collect propose calls specifically
        if (addr === rollupAddressLower && validCall.functionName === 'propose') {
          proposeCalls.push(callData);
        }
      }

      // Validate exactly ONE propose call
      if (proposeCalls.length === 0) {
        this.logger.warn(`No propose calls found in multicall3`, { txHash });
        return undefined;
      }

      if (proposeCalls.length > 1) {
        this.logger.warn(`Multiple propose calls found in multicall3 (${proposeCalls.length})`, { txHash });
        return undefined;
      }

      // Successfully extracted single propose call
      return proposeCalls[0];
    } catch (err) {
      // Any decoding error triggers fallback to trace
      this.logger.warn(`Failed to decode multicall3: ${err}`, { txHash });
      return undefined;
    }
  }

  /**
   * Attempts to decode transaction as a direct propose call to the rollup contract.
   * Returns undefined if validation fails.
   * @param tx - The transaction-like object with to, input, and hash
   * @returns The propose calldata if successfully validated, undefined otherwise
   */
  protected tryDecodeDirectPropose(tx: { to: Hex | null | undefined; input: Hex; hash: Hex }): Hex | undefined {
    const txHash = tx.hash;
    try {
      // Check if transaction is to the rollup address
      if (!tx.to || !EthAddress.areEqual(tx.to, this.rollupAddress)) {
        this.logger.debug(`Transaction is not to rollup address (to: ${tx.to})`, { txHash });
        return undefined;
      }

      // Try to decode as propose call
      const { functionName } = decodeFunctionData({ abi: RollupAbi, data: tx.input });

      // If not propose, return undefined
      if (functionName !== 'propose') {
        this.logger.warn(`Transaction to rollup is not propose (got ${functionName})`, { txHash });
        return undefined;
      }

      // Successfully validated direct propose call
      this.logger.trace(`Validated direct propose call to rollup`, { txHash });
      return tx.input;
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
      this.logger.verbose(`Failed trace_transaction for ${txHash}`, { traceError });

      try {
        // Fall back to debug_traceTransaction (Geth RPC)
        this.logger.debug(`Attempting to trace transaction ${txHash} using debug_traceTransaction`);
        calls = await getSuccessfulCallsFromDebug(this.debugClient, txHash, rollupAddress, selector, this.logger);
        this.logger.debug(`Successfully traced using debug_traceTransaction, found ${calls.length} calls`);
      } catch (debugErr) {
        const debugError = debugErr instanceof Error ? debugErr : new Error(String(debugErr));
        this.logger.warn(`All tracing methods failed for tx ${txHash}`, {
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
   * Extracts the CommitteeAttestations struct definition from RollupAbi.
   * Finds the _attestations parameter by name in the propose function.
   * Lazy-loaded to avoid issues during module initialization.
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

  /**
   * Decodes propose calldata and builds the checkpoint header structure.
   * @param proposeCalldata - The propose function calldata
   * @param blockHash - The L1 block hash containing this transaction
   * @param checkpointNumber - The checkpoint number
   * @param expectedHashes - Optional expected hashes from the CheckpointProposed event for validation
   * @returns The decoded checkpoint header and metadata
   */
  protected decodeAndBuildCheckpoint(
    proposeCalldata: Hex,
    blockHash: Hex,
    checkpointNumber: CheckpointNumber,
    expectedHashes: {
      attestationsHash?: Hex;
      payloadDigest?: Hex;
    },
  ): {
    checkpointNumber: CheckpointNumber;
    archiveRoot: Fr;
    header: CheckpointHeader;
    attestations: CommitteeAttestation[];
    blockHash: string;
  } {
    const { functionName: rollupFunctionName, args: rollupArgs } = decodeFunctionData({
      abi: RollupAbi,
      data: proposeCalldata,
    });

    if (rollupFunctionName !== 'propose') {
      throw new Error(`Unexpected rollup method called ${rollupFunctionName}`);
    }

    const [decodedArgs, packedAttestations, _signers, _attestationsAndSignersSignature, _blobInput] =
      rollupArgs! as readonly [
        {
          archive: Hex;
          oracleInput: { feeAssetPriceModifier: bigint };
          header: ViemHeader;
        },
        ViemCommitteeAttestations,
        Hex[],
        ViemSignature,
        Hex,
      ];

    const attestations = CommitteeAttestation.fromPacked(packedAttestations, this.targetCommitteeSize);
    const header = CheckpointHeader.fromViem(decodedArgs.header);
    const archiveRoot = new Fr(Buffer.from(hexToBytes(decodedArgs.archive)));

    // Validate attestationsHash if provided (skip for backwards compatibility with older events)
    if (expectedHashes.attestationsHash) {
      // Compute attestationsHash: keccak256(abi.encode(CommitteeAttestations))
      const computedAttestationsHash = keccak256(
        encodeAbiParameters([this.getCommitteeAttestationsStructDef()], [packedAttestations]),
      );

      // Compare as buffers to avoid case-sensitivity and string comparison issues
      const computedBuffer = Buffer.from(hexToBytes(computedAttestationsHash));
      const expectedBuffer = Buffer.from(hexToBytes(expectedHashes.attestationsHash));

      if (!computedBuffer.equals(expectedBuffer)) {
        throw new Error(
          `Attestations hash mismatch for checkpoint ${checkpointNumber}: ` +
            `computed=${computedAttestationsHash}, expected=${expectedHashes.attestationsHash}`,
        );
      }

      this.logger.trace(`Validated attestationsHash for checkpoint ${checkpointNumber}`, {
        computedAttestationsHash,
        expectedAttestationsHash: expectedHashes.attestationsHash,
      });
    }

    // Validate payloadDigest if provided (skip for backwards compatibility with older events)
    if (expectedHashes.payloadDigest) {
      // Use ConsensusPayload to compute the digest - this ensures we match the exact logic
      // used by the network for signing and verification
      const consensusPayload = new ConsensusPayload(header, archiveRoot);
      const payloadToSign = consensusPayload.getPayloadToSign(SignatureDomainSeparator.checkpointAttestation);
      const computedPayloadDigest = keccak256(payloadToSign);

      // Compare as buffers to avoid case-sensitivity and string comparison issues
      const computedBuffer = Buffer.from(hexToBytes(computedPayloadDigest));
      const expectedBuffer = Buffer.from(hexToBytes(expectedHashes.payloadDigest));

      if (!computedBuffer.equals(expectedBuffer)) {
        throw new Error(
          `Payload digest mismatch for checkpoint ${checkpointNumber}: ` +
            `computed=${computedPayloadDigest}, expected=${expectedHashes.payloadDigest}`,
        );
      }

      this.logger.trace(`Validated payloadDigest for checkpoint ${checkpointNumber}`, {
        computedPayloadDigest,
        expectedPayloadDigest: expectedHashes.payloadDigest,
      });
    }

    this.logger.trace(`Decoded propose calldata`, {
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
      blockHash,
    };
  }
}

/**
 * Pre-computed function selectors for all valid contract calls.
 * These are computed once at module load time from the ABIs.
 * Based on analysis of sequencer-client/src/publisher/sequencer-publisher.ts
 */

// Rollup contract function selectors (always valid)
const PROPOSE_SELECTOR = toFunctionSelector(RollupAbi.find(x => x.type === 'function' && x.name === 'propose')!);
const INVALIDATE_BAD_ATTESTATION_SELECTOR = toFunctionSelector(
  RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateBadAttestation')!,
);
const INVALIDATE_INSUFFICIENT_ATTESTATIONS_SELECTOR = toFunctionSelector(
  RollupAbi.find(x => x.type === 'function' && x.name === 'invalidateInsufficientAttestations')!,
);

// Governance proposer function selectors
const GOVERNANCE_SIGNAL_WITH_SIG_SELECTOR = toFunctionSelector(
  GovernanceProposerAbi.find(x => x.type === 'function' && x.name === 'signalWithSig')!,
);

// Slash factory function selectors
const CREATE_SLASH_PAYLOAD_SELECTOR = toFunctionSelector(
  SlashFactoryAbi.find(x => x.type === 'function' && x.name === 'createSlashPayload')!,
);

// Empire slashing proposer function selectors
const EMPIRE_SIGNAL_WITH_SIG_SELECTOR = toFunctionSelector(
  EmpireSlashingProposerAbi.find(x => x.type === 'function' && x.name === 'signalWithSig')!,
);
const EMPIRE_SUBMIT_ROUND_WINNER_SELECTOR = toFunctionSelector(
  EmpireSlashingProposerAbi.find(x => x.type === 'function' && x.name === 'submitRoundWinner')!,
);

// Tally slashing proposer function selectors
const TALLY_VOTE_SELECTOR = toFunctionSelector(
  TallySlashingProposerAbi.find(x => x.type === 'function' && x.name === 'vote')!,
);
const TALLY_EXECUTE_ROUND_SELECTOR = toFunctionSelector(
  TallySlashingProposerAbi.find(x => x.type === 'function' && x.name === 'executeRound')!,
);

/**
 * Defines a valid contract call that can appear in a sequencer publisher transaction
 */
interface ValidContractCall {
  /** Contract address (lowercase for comparison) */
  address: string;
  /** Function selector (4 bytes) */
  functionSelector: Hex;
  /** Human-readable function name for logging */
  functionName: string;
}

/**
 * All valid contract calls that the sequencer publisher can make.
 * Builds the list of valid (address, selector) pairs for validation.
 *
 * Alternatively, if we are absolutely sure that no code path from any of these
 * contracts can eventually land on another call to `propose`, we can remove the
 * function selectors.
 */
function computeValidContractCalls(addresses: {
  rollupAddress: EthAddress;
  governanceProposerAddress?: EthAddress;
  slashFactoryAddress?: EthAddress;
  slashingProposerAddress?: EthAddress;
}): ValidContractCall[] {
  const { rollupAddress, governanceProposerAddress, slashFactoryAddress, slashingProposerAddress } = addresses;
  const calls: ValidContractCall[] = [];

  // Rollup contract calls (always present)
  calls.push(
    {
      address: rollupAddress.toString().toLowerCase(),
      functionSelector: PROPOSE_SELECTOR,
      functionName: 'propose',
    },
    {
      address: rollupAddress.toString().toLowerCase(),
      functionSelector: INVALIDATE_BAD_ATTESTATION_SELECTOR,
      functionName: 'invalidateBadAttestation',
    },
    {
      address: rollupAddress.toString().toLowerCase(),
      functionSelector: INVALIDATE_INSUFFICIENT_ATTESTATIONS_SELECTOR,
      functionName: 'invalidateInsufficientAttestations',
    },
  );

  // Governance proposer calls (optional)
  if (governanceProposerAddress && !governanceProposerAddress.isZero()) {
    calls.push({
      address: governanceProposerAddress.toString().toLowerCase(),
      functionSelector: GOVERNANCE_SIGNAL_WITH_SIG_SELECTOR,
      functionName: 'signalWithSig',
    });
  }

  // Slash factory calls (optional)
  if (slashFactoryAddress && !slashFactoryAddress.isZero()) {
    calls.push({
      address: slashFactoryAddress.toString().toLowerCase(),
      functionSelector: CREATE_SLASH_PAYLOAD_SELECTOR,
      functionName: 'createSlashPayload',
    });
  }

  // Slashing proposer calls (optional, can be either Empire or Tally)
  if (slashingProposerAddress && !slashingProposerAddress.isZero()) {
    // Empire calls
    calls.push(
      {
        address: slashingProposerAddress.toString().toLowerCase(),
        functionSelector: EMPIRE_SIGNAL_WITH_SIG_SELECTOR,
        functionName: 'signalWithSig (empire)',
      },
      {
        address: slashingProposerAddress.toString().toLowerCase(),
        functionSelector: EMPIRE_SUBMIT_ROUND_WINNER_SELECTOR,
        functionName: 'submitRoundWinner',
      },
    );

    // Tally calls
    calls.push(
      {
        address: slashingProposerAddress.toString().toLowerCase(),
        functionSelector: TALLY_VOTE_SELECTOR,
        functionName: 'vote',
      },
      {
        address: slashingProposerAddress.toString().toLowerCase(),
        functionSelector: TALLY_EXECUTE_ROUND_SELECTOR,
        functionName: 'executeRound',
      },
    );
  }

  return calls;
}
