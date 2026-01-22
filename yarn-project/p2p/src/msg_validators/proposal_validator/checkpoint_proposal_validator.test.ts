import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { MakeCheckpointProposalOptions } from '@aztec/stdlib/testing';
import { makeBlockHeader, makeCheckpointHeader, makeCheckpointProposal } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { CheckpointProposalValidator } from './checkpoint_proposal_validator.js';
import { sharedProposalValidatorTests } from './proposal_validator_test_suite.js';

const logger = createLogger('p2p:test:checkpoint-proposal-validator');

describe('CheckpointProposalValidator', () => {
  /**
   * Adapter function to convert shared test options to CheckpointProposal options.
   * The shared test uses blockHeader/lastBlockHeader, but CheckpointProposal uses
   * checkpointHeader and lastBlock.blockHeader.
   */
  const makeCheckpointProposalAdapter = (options?: {
    blockHeader?: CheckpointHeader;
    lastBlockHeader?: CheckpointHeader;
    signer?: Secp256k1Signer;
    txHashes?: TxHash[];
    txs?: any[];
  }) => {
    // Use the blockHeader directly as the checkpointHeader
    const checkpointHeader = options?.blockHeader ?? makeCheckpointHeader(1);

    // Create a BlockHeader for the lastBlock using the slot from the checkpointHeader
    const lastBlockBlockHeader = options?.lastBlockHeader
      ? makeBlockHeader(0, { slotNumber: checkpointHeader.slotNumber })
      : undefined;

    const adaptedOptions: MakeCheckpointProposalOptions = {
      signer: options?.signer,
      checkpointHeader,
      // Create lastBlock with a proper BlockHeader
      lastBlock: lastBlockBlockHeader
        ? {
            blockHeader: lastBlockBlockHeader,
            txHashes: options?.txHashes,
            txs: options?.txs,
          }
        : undefined,
    };

    return makeCheckpointProposal(adaptedOptions);
  };

  sharedProposalValidatorTests({
    validatorFactory: (epochCache, opts) => new CheckpointProposalValidator(epochCache, opts, logger),
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
