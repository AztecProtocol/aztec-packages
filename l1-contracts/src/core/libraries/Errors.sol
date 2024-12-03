// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec protocol
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 */
library Errors {
  // DEVNET related
  error DevNet__NoPruningAllowed(); // 0x6984c590
  error DevNet__InvalidProposer(address expected, address actual); // 0x11e6e6f7

  // Inbox
  error Inbox__Unauthorized(); // 0xe5336a6b
  error Inbox__ActorTooLarge(bytes32 actor); // 0xa776a06e
  error Inbox__ContentTooLarge(bytes32 content); // 0x47452014
  error Inbox__SecretHashTooLarge(bytes32 secretHash); // 0xecde7e2c
  error Inbox__MustBuildBeforeConsume(); // 0xc4901999

  // Outbox
  error Outbox__Unauthorized(); // 0x2c9490c2
  error Outbox__InvalidChainId(); // 0x577ec7c4
  error Outbox__InvalidVersion(uint256 entry, uint256 message); // 0x7915cac3
  error Outbox__NothingToConsume(bytes32 messageHash); // 0xfb4fb506
  error Outbox__IncompatibleEntryArguments(
    bytes32 messageHash,
    uint64 storedFee,
    uint64 feePassed,
    uint32 storedVersion,
    uint32 versionPassed,
    uint32 storedDeadline,
    uint32 deadlinePassed
  ); // 0x5e789f34
  error Outbox__InvalidPathLength(uint256 expected, uint256 actual); // 0x481bcd9c
  error Outbox__InsertingInvalidRoot(); // 0x73c2daca
  error Outbox__RootAlreadySetAtBlock(uint256 l2BlockNumber); // 0x3eccfd3e
  error Outbox__InvalidRecipient(address expected, address actual); // 0x57aad581
  error Outbox__AlreadyNullified(uint256 l2BlockNumber, uint256 leafIndex); // 0xfd71c2d4
  error Outbox__NothingToConsumeAtBlock(uint256 l2BlockNumber); // 0xa4508f22
  error Outbox__BlockNotProven(uint256 l2BlockNumber); // 0x0e194a6d

  // Rollup
  error Rollup__InsufficientBondAmount(uint256 minimum, uint256 provided); // 0xa165f276
  error Rollup__InsufficientFundsInEscrow(uint256 required, uint256 available); // 0xa165f276
  error Rollup__InvalidArchive(bytes32 expected, bytes32 actual); // 0xb682a40e
  error Rollup__InvalidBlockHash(bytes32 expected, bytes32 actual);
  error Rollup__InvalidBlockNumber(uint256 expected, uint256 actual); // 0xe5edf847
  error Rollup__InvalidChainId(uint256 expected, uint256 actual); // 0x37b5bc12
  error Rollup__InvalidEpoch(Epoch expected, Epoch actual); // 0x3c6d65e6
  error Rollup__InvalidInHash(bytes32 expected, bytes32 actual); // 0xcd6f4233
  error Rollup__InvalidPreviousArchive(bytes32 expected, bytes32 actual); // 0xb682a40e
  error Rollup__InvalidPreviousBlockHash(bytes32 expected, bytes32 actual);
  error Rollup__InvalidProof(); // 0xa5b2ba17
  error Rollup__InvalidProposedArchive(bytes32 expected, bytes32 actual); // 0x32532e73
  error Rollup__InvalidTimestamp(Timestamp expected, Timestamp actual); // 0x3132e895
  error Rollup__InvalidVersion(uint256 expected, uint256 actual); // 0x9ef30794
  error Rollup__NoEpochToProve(); // 0xcbaa3951
  error Rollup__NonSequentialProving(); // 0x1e5be132
  error Rollup__NotClaimingCorrectEpoch(Epoch expected, Epoch actual); // 0xf0e0744d
  error Rollup__NothingToPrune(); // 0x850defd3
  error Rollup__NotInClaimPhase(uint256 currentSlotInEpoch, uint256 claimDuration); // 0xe6969f11
  error Rollup__ProofRightAlreadyClaimed(); // 0x2cac5f0a
  error Rollup__QuoteExpired(Slot currentSlot, Slot quoteSlot); // 0x20a001eb
  error Rollup__SlotAlreadyInChain(Slot lastSlot, Slot proposedSlot); // 0x83510bd0
  error Rollup__TimestampInFuture(Timestamp max, Timestamp actual); // 0x89f30690
  error Rollup__TimestampTooOld(); // 0x72ed9c81
  error Rollup__TryingToProveNonExistingBlock(); // 0x34ef4954
  error Rollup__UnavailableTxs(bytes32 txsHash); // 0x414906c3
  error Rollup__NonZeroDaFee(); // 0xd9c75f52
  error Rollup__NonZeroL2Fee(); // 0x7e728abc
  error Rollup__InvalidBasisPointFee(uint256 basisPointFee); // 0x4292d136
  error Rollup__InvalidManaBaseFee(uint256 expected, uint256 actual); // 0x73b6d896

  //TxsDecoder
  error TxsDecoder__InvalidLogsLength(uint256 expected, uint256 actual); // 0x829ca981
  error TxsDecoder__TxsTooLarge(uint256 expected, uint256 actual); // 0xc7d44a62

  // HeaderLib
  error HeaderLib__InvalidHeaderSize(uint256 expected, uint256 actual); // 0xf3ccb247
  error HeaderLib__InvalidSlotNumber(Slot expected, Slot actual); // 0x09ba91ff

  // MerkleLib
  error MerkleLib__InvalidRoot(bytes32 expected, bytes32 actual, bytes32 leaf, uint256 leafIndex); // 0x5f216bf1

  // SignatureLib
  error SignatureLib__CannotVerifyEmpty(); // 0xc7690a37
  error SignatureLib__InvalidSignature(address expected, address recovered); // 0xd9cbae6c

  // SampleLib
  error SampleLib__IndexOutOfBounds(uint256 requested, uint256 bound); // 0xa12fc559

  // Sequencer Selection (Leonidas)
  error Leonidas__EpochNotSetup(); // 0xcf4e597e
  error Leonidas__InvalidProposer(address expected, address actual); // 0xd02d278e
  error Leonidas__InsufficientAttestations(uint256 minimumNeeded, uint256 provided); // 0xbf1ca4cb
  error Leonidas__InsufficientAttestationsProvided(uint256 minimumNeeded, uint256 provided); // 0xb3a697c2

  // Fee Juice Portal
  error FeeJuicePortal__AlreadyInitialized(); // 0xc7a172fe
  error FeeJuicePortal__InvalidInitialization(); // 0xfd9b3208
  error FeeJuicePortal__Unauthorized(); // 0x67e3691e

  // Proof Commitment Escrow
  error ProofCommitmentEscrow__InsufficientBalance(uint256 balance, uint256 requested); // 0x09b8b789
  error ProofCommitmentEscrow__NotOwner(address caller); // 0x2ac332c1
  error ProofCommitmentEscrow__WithdrawRequestNotReady(uint256 current, Timestamp readyAt); // 0xb32ab8a7

  // FeeMath
  error FeeMath__InvalidProvingCostModifier(); // 0x8b9d62ac
  error FeeMath__InvalidFeeAssetPriceModifier(); // 0xf2fb32ad
}
