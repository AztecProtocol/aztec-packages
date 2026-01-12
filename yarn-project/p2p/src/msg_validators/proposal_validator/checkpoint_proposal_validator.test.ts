import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { L2BlockHeader } from '@aztec/stdlib/block';
import type { MakeCheckpointProposalOptions } from '@aztec/stdlib/testing';
import { makeCheckpointProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { CheckpointProposalValidator } from './checkpoint_proposal_validator.js';
import { sharedProposalValidatorTests } from './proposal_validator_test_suite.js';

describe('CheckpointProposalValidator', () => {
  /**
   * Adapter function to convert shared test options to CheckpointProposal options.
   * The shared test uses blockHeader/lastBlockHeader, but CheckpointProposal uses
   * checkpointHeader (derived from L2BlockHeader) and lastBlock.blockHeader.
   */
  const makeCheckpointProposalAdapter = (options?: {
    blockHeader?: L2BlockHeader;
    lastBlockHeader?: L2BlockHeader;
    signer?: Secp256k1Signer;
    txHashes?: TxHash[];
    txs?: any[];
  }) => {
    // Use the blockHeader to derive the checkpointHeader (for slotNumber matching)
    const l2BlockHeader = options?.blockHeader ?? makeL2BlockHeader(1);
    const checkpointHeader = l2BlockHeader.toCheckpointHeader();

    const adaptedOptions: MakeCheckpointProposalOptions = {
      signer: options?.signer,
      checkpointHeader,
      // Use lastBlockHeader for the lastBlock if provided
      lastBlock: options?.lastBlockHeader
        ? {
            blockHeader: options.lastBlockHeader,
            txHashes: options?.txHashes,
            txs: options?.txs,
          }
        : undefined,
    };

    return makeCheckpointProposal(adaptedOptions);
  };

  sharedProposalValidatorTests({
    validatorFactory: (epochCache, opts) => new CheckpointProposalValidator(epochCache, opts),
    makeProposal: makeCheckpointProposalAdapter,
    makeHeader: (epochNumber: number | bigint, slotNumber: number | bigint, blockNumber: number | bigint) =>
      makeL2BlockHeader(0, Number(blockNumber), Number(slotNumber)),
    getSigner: () => Secp256k1Signer.random(),
    getAddress: (signer?: Secp256k1Signer) => (signer ? signer.address : EthAddress.random()),
    getSlot: (slot: number | bigint) => SlotNumber(Number(slot)),
    getTxHashes: (n: number) => Array.from({ length: n }, () => TxHash.random()),
    getTxs: () => [],
    epochCacheMock: () => mock<EpochCacheInterface>(),
  });
});
