import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { MakeCheckpointProposalOptions } from '@aztec/stdlib/testing';
import { makeCheckpointHeader, makeCheckpointProposal } from '@aztec/stdlib/testing';
import { type BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { CheckpointProposalValidator } from './checkpoint_proposal_validator.js';
import { sharedProposalValidatorTests } from './proposal_validator_test_suite.js';

describe('CheckpointProposalValidator', () => {
  /**
   * Adapter function to convert shared test options to CheckpointProposal options.
   * The shared test uses blockHeader/lastBlockHeader, but CheckpointProposal uses
   * checkpointHeader and lastBlock.blockHeader.
   */
  const makeCheckpointProposalAdapter = (options?: {
    blockHeader?: CheckpointHeader;
    lastBlockHeader?: BlockHeader;
    signer?: Secp256k1Signer;
    txHashes?: TxHash[];
    txs?: any[];
  }) => {
    // Use the blockHeader directly as the checkpointHeader
    const checkpointHeader = options?.blockHeader ?? makeCheckpointHeader(1);

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
    makeHeader: (_epochNumber: number | bigint, slotNumber: number | bigint, _blockNumber: number | bigint) =>
      makeCheckpointHeader(0, { slotNumber: SlotNumber(Number(slotNumber)) }),
    getSigner: () => Secp256k1Signer.random(),
    getAddress: (signer?: Secp256k1Signer) => (signer ? signer.address : EthAddress.random()),
    getSlot: (slot: number | bigint) => SlotNumber(Number(slot)),
    getTxHashes: (n: number) => Array.from({ length: n }, () => TxHash.random()),
    getTxs: () => [],
    epochCacheMock: () => mock<EpochCacheInterface>(),
  });
});
