import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { makeBlockProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import { BlockProposalValidator } from './block_proposal_validator.js';
import { sharedProposalValidatorTests } from './proposal_validator_test_suite.js';

describe('BlockProposalValidator', () => {
  sharedProposalValidatorTests({
    validatorFactory: (epochCache, opts) => new BlockProposalValidator(epochCache, opts),
    makeProposal: makeBlockProposal,
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
