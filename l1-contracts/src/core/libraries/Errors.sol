// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Status, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";

/**
 * @title Errors Library
 * @author Aztec Labs
 * @notice Library that contains errors used throughout the Aztec protocol
 * Errors are prefixed with the contract name to make it easy to identify where the error originated
 * when there are multiple contracts that could have thrown the error.
 *
 * Sigs are provided for easy reference, but don't trust; verify! run `forge inspect
 * src/core/libraries/Errors.sol:Errors errors`
 */
library Errors {
  // DEVNET related
  error DevNet__NoPruningAllowed(); // 0x6984c590
  error DevNet__InvalidProposer(address expected, address actual); // 0x11e6e6f7

  // Inbox
  error Inbox__Unauthorized(); // 0xe5336a6b
  error Inbox__ActorTooLarge(bytes32 actor); // 0xa776a06e
  error Inbox__VersionMismatch(uint256 expected, uint256 actual); // 0x47452014
  error Inbox__ContentTooLarge(bytes32 content); // 0x47452014
  error Inbox__SecretHashTooLarge(bytes32 secretHash); // 0xecde7e2c
  error Inbox__MustBuildBeforeConsume(); // 0xc4901999
  error Inbox__Ignition();

  // Outbox
  error Outbox__Unauthorized(); // 0x2c9490c2
  error Outbox__InvalidChainId(); // 0x577ec7c4
  error Outbox__VersionMismatch(uint256 expected, uint256 actual);
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
  error Outbox__InvalidRecipient(address expected, address actual); // 0x57aad581
  error Outbox__AlreadyNullified(Epoch epoch, uint256 leafIndex); // 0xfd71c2d4
  error Outbox__NothingToConsumeAtEpoch(Epoch epoch); // 0x5e3d32ce
  error Outbox__PathTooLong();
  error Outbox__LeafIndexOutOfBounds(uint256 leafIndex, uint256 pathLength);

  // Rollup
  error Rollup__InsufficientBondAmount(uint256 minimum, uint256 provided); // 0xa165f276
  error Rollup__InsufficientFundsInEscrow(uint256 required, uint256 available); // 0xa165f276
  error Rollup__InvalidArchive(bytes32 expected, bytes32 actual); // 0xb682a40e
  error Rollup__InvalidCheckpointNumber(uint256 expected, uint256 actual); // 0xd1ba9bfa
  error Rollup__InvalidInHash(bytes32 expected, bytes32 actual); // 0xcd6f4233
  error Rollup__InvalidOutHash(bytes32 expected, bytes32 actual); // 0x8eb39062
  error Rollup__InvalidPreviousArchive(bytes32 expected, bytes32 actual); // 0xb682a40e
  error Rollup__InvalidProof(); // 0xa5b2ba17
  error Rollup__InvalidProposedArchive(bytes32 expected, bytes32 actual); // 0x32532e73
  error Rollup__InvalidTimestamp(Timestamp expected, Timestamp actual); // 0x3132e895
  error Rollup__InvalidAttestations();
  error Rollup__AttestationsAreValid();
  error Rollup__InvalidAttestationIndex();
  error Rollup__CheckpointAlreadyProven();
  error Rollup__CheckpointNotInPendingChain();
  error Rollup__InvalidBlobHash(bytes32 expected, bytes32 actual); // 0x13031e6a
  error Rollup__InvalidBlobProof(bytes32 blobHash); // 0x5ca17bef
  error Rollup__NoEpochToProve(); // 0xcbaa3951
  error Rollup__NonSequentialProving(); // 0x1e5be132
  error Rollup__NothingToPrune(); // 0x850defd3
  error Rollup__SlotAlreadyInChain(Slot lastSlot, Slot proposedSlot); // 0x83510bd0
  error Rollup__TimestampInFuture(Timestamp max, Timestamp actual); // 0x89f30690
  error Rollup__TimestampTooOld(); // 0x72ed9c81
  error Rollup__TryingToProveNonExistingCheckpoint(); // 0xdd65748c
  error Rollup__UnavailableTxs(bytes32 txsHash); // 0x414906c3
  error Rollup__NonZeroDaFee(); // 0xd9c75f52
  error Rollup__InvalidBasisPointFee(uint256 basisPointFee); // 0x4292d136
  error Rollup__InvalidManaMinFee(uint256 expected, uint256 actual); // 0x73b6d896
  error Rollup__StartAndEndNotSameEpoch(Epoch start, Epoch end); // 0xb64ec33e
  error Rollup__StartIsNotFirstCheckpointOfEpoch(); // 0x19ceb206
  error Rollup__StartIsNotBuildingOnProven(); // 0x4a59f42e
  error Rollup__TooManyCheckpointsInEpoch(uint256 expected, uint256 actual); // 0xdf838503
  error Rollup__NotPastDeadline(Epoch deadline, Epoch currentEpoch);
  error Rollup__PastDeadline(Epoch deadline, Epoch currentEpoch);
  error Rollup__ProverHaveAlreadySubmitted(address prover, Epoch epoch);
  error Rollup__InvalidManaTarget(uint256 minimum, uint256 provided);
  error Rollup__ManaLimitExceeded();
  error Rollup__RewardsNotClaimable();
  error Rollup__TooSoonToSetRewardsClaimable(uint256 earliestRewardsClaimableTimestamp, uint256 currentTimestamp);
  error Rollup__InvalidFirstEpochProof();
  error Rollup__InvalidCoinbase();
  error Rollup__UnavailableTempCheckpointLog(
    uint256 checkpointNumber, uint256 pendingCheckpointNumber, uint256 upperLimit
  );
  error Rollup__NoBlobsInCheckpoint();
  error Rollup__CannotInvalidateEscapeHatch();
  error Rollup__InvalidEscapeHatchProposer(address expected, address actual);

  // EscapeHatch
  error EscapeHatch__AlreadyInCandidateSet(address candidate);
  error EscapeHatch__NotInCandidateSet(address candidate);
  error EscapeHatch__InvalidStatus(Status expected, Status actual);
  error EscapeHatch__NotExitableYet(uint256 exitableAt, uint256 currentTime);
  error EscapeHatch__OnlyRollup(address caller, address rollup);
  error EscapeHatch__NoDesignatedProposer(Hatch hatch);
  error EscapeHatch__InvalidConfiguration();
  error EscapeHatch__SetUnstable(Hatch hatch);
  error EscapeHatch__AlreadyValidated(Hatch hatch);
  error EscapeHatch__HatchTooEarly(Hatch hatch);

  // ProposedHeaderLib
  error HeaderLib__InvalidHeaderSize(uint256 expected, uint256 actual); // 0xf3ccb247
  error HeaderLib__InvalidSlotNumber(Slot expected, Slot actual); // 0x09ba91ff

  // MerkleLib
  error MerkleLib__InvalidRoot(bytes32 expected, bytes32 actual, bytes32 leaf, uint256 leafIndex); // 0x5f216bf1
  error MerkleLib__InvalidIndexForPathLength();

  // SampleLib
  error SampleLib__IndexOutOfBounds(uint256 requested, uint256 bound); // 0xa12fc559
  error SampleLib__SampleLargerThanIndex(uint256 sample, uint256 index); // 0xa11b0f79

  // Sequencer Selection (ValidatorSelection)
  error ValidatorSelection__EpochNotSetup(); // 0x10816cae
  error ValidatorSelection__InvalidProposer(address expected, address actual); // 0xa8843a68
  error ValidatorSelection__MissingProposerSignature(address proposer, uint256 index);
  error ValidatorSelection__InvalidDeposit(address attester, address proposer); // 0x533169bd
  error ValidatorSelection__InsufficientAttestations(uint256 minimumNeeded, uint256 provided); // 0xaf47297f
  error ValidatorSelection__InvalidCommitteeCommitment(bytes32 reconstructed, bytes32 expected); // 0xca8d5954
  error ValidatorSelection__InsufficientValidatorSetSize(uint256 actual, uint256 expected); // 0xf4f28e99
  error ValidatorSelection__ProposerIndexTooLarge(uint256 index);
  error ValidatorSelection__EpochNotStable(uint256 queriedEpoch, uint32 currentTimestamp);
  error ValidatorSelection__InvalidLagInEpochs(uint256 lagInEpochsForValidatorSet, uint256 lagInEpochsForRandao);

  // Staking
  error Staking__AlreadyQueued(address _attester);
  error Staking__QueueEmpty();
  error Staking__DepositOutOfGas();
  error Staking__AlreadyActive(address attester); // 0x5e206fa4
  error Staking__QueueAlreadyFlushed(Epoch epoch); // 0x21148c78
  error Staking__AlreadyRegistered(address instance, address attester);
  error Staking__CannotSlashExitedStake(address); // 0x45bf4940
  error Staking__FailedToRemove(address); // 0xa7d7baab
  error Staking__InvalidDeposit(address attester, address proposer); // 0xf33fe8c6
  error Staking__InvalidRecipient(address); // 0x7e2f7f1c
  error Staking__InsufficientStake(uint256, uint256); // 0x903aee24
  error Staking__NoOneToSlash(address); // 0x7e2f7f1c
  error Staking__NotExiting(address); // 0xef566ee0
  error Staking__InitiateWithdrawNeeded(address);
  error Staking__NotSlasher(address, address); // 0x23a6f432
  error Staking__NotWithdrawer(address, address); // 0x8e668e5d
  error Staking__NothingToExit(address); // 0xd2aac9b6
  error Staking__WithdrawalNotUnlockedYet(Timestamp, Timestamp); // 0x88e1826c
  error Staking__WithdrawFailed(address); // 0x377422c1
  error Staking__OutOfBounds(uint256, uint256); // 0x4bea6597
  error Staking__NotRollup(address); // 0xf5509eb3
  error Staking__RollupAlreadyRegistered(address); // 0x108a39c8
  error Staking__InvalidRollupAddress(address); // 0xd876720e
  error Staking__NotCanonical(address); // 0x6244212e
  error Staking__InstanceDoesNotExist(address);
  error Staking__InsufficientPower(uint256, uint256);
  error Staking__AlreadyExiting(address);
  error Staking__FatalError(string);
  error Staking__NotOurProposal(uint256, address, address);
  error Staking__IncorrectGovProposer(uint256);
  error Staking__GovernanceAlreadySet();
  error Staking__InsufficientBootstrapValidators(uint256 queueSize, uint256 bootstrapFlushSize);
  error Staking__InvalidStakingQueueConfig();
  error Staking__InvalidNormalFlushSizeQuotient();

  // Fee Juice Portal
  error FeeJuicePortal__AlreadyInitialized(); // 0xc7a172fe
  error FeeJuicePortal__InvalidInitialization(); // 0xfd9b3208
  error FeeJuicePortal__Unauthorized(); // 0x67e3691e

  // Proof Commitment Escrow
  error ProofCommitmentEscrow__InsufficientBalance(uint256 balance, uint256 requested); // 0x09b8b789
  error ProofCommitmentEscrow__NotOwner(address caller); // 0x2ac332c1
  error ProofCommitmentEscrow__WithdrawRequestNotReady(uint256 current, Timestamp readyAt); // 0xb32ab8a7

  // FeeLib
  error FeeLib__InvalidFeeAssetPriceModifier(); // 0xf2fb32ad
  error FeeLib__AlreadyPreheated();
  error FeeLib__InvalidManaLimit(uint256 maximum, uint256 provided);
  error FeeLib__InvalidInitialEthPerFeeAsset(uint256 provided, uint256 minimum, uint256 maximum);

  // SignatureLib (duplicated)
  error SignatureLib__InvalidSignature(address, address); // 0xd9cbae6c

  error AttestationLib__InvalidDataSize(uint256, uint256);
  error AttestationLib__SignatureIndicesSizeMismatch(uint256, uint256);
  error AttestationLib__SignaturesOrAddressesSizeMismatch(uint256, uint256);
  error AttestationLib__SignersSizeMismatch(uint256, uint256);
  error AttestationLib__NotASignatureAtIndex(uint256 index);
  error AttestationLib__NotAnAddressAtIndex(uint256 index);

  // RewardBooster
  error RewardBooster__OnlyRollup(address caller);

  error RewardLib__InvalidSequencerBps();

  // TallySlashingProposer
  error TallySlashingProposer__InvalidSignature();
  error TallySlashingProposer__InvalidVoteLength(uint256 expected, uint256 actual);
  error TallySlashingProposer__RoundAlreadyExecuted(SlashRound round);
  error TallySlashingProposer__InvalidNumberOfCommittees(uint256 expected, uint256 actual);
  error TallySlashingProposer__RoundNotComplete(SlashRound round);
  error TallySlashingProposer__InvalidCommitteeSize(uint256 expected, uint256 actual);
  error TallySlashingProposer__InvalidCommitteeCommitment();
  error TallySlashingProposer__InvalidQuorumAndRoundSize(uint256 quorum, uint256 roundSize);
  error TallySlashingProposer__QuorumMustBeGreaterThanZero();
  error TallySlashingProposer__InvalidSlashAmounts(uint256[3] slashAmounts);
  error TallySlashingProposer__LifetimeMustBeGreaterThanExecutionDelay(uint256 lifetime, uint256 executionDelay);
  error TallySlashingProposer__LifetimeMustBeLessThanRoundabout(uint256 lifetime, uint256 roundabout);
  error TallySlashingProposer__RoundSizeInEpochsMustBeGreaterThanZero(uint256 roundSizeInEpochs);
  error TallySlashingProposer__RoundSizeTooLarge(uint256 roundSize, uint256 maxRoundSize);
  error TallySlashingProposer__CommitteeSizeMustBeGreaterThanZero(uint256 committeeSize);
  error TallySlashingProposer__SlashAmountTooLarge();
  error TallySlashingProposer__VoteAlreadyCastInCurrentSlot(Slot slot);
  error TallySlashingProposer__RoundOutOfRange(SlashRound round, SlashRound currentRound);
  error TallySlashingProposer__RoundSizeMustBeMultipleOfEpochDuration(uint256 roundSize, uint256 epochDuration);
  error TallySlashingProposer__VotingNotOpen(SlashRound currentRound);
  error TallySlashingProposer__SlashOffsetMustBeGreaterThanZero(uint256 slashOffset);
  error TallySlashingProposer__InvalidEpochIndex(uint256 epochIndex, uint256 roundSizeInEpochs);
  error TallySlashingProposer__VoteSizeTooBig(uint256 voteSize, uint256 maxSize);
  error TallySlashingProposer__VotesMustBeMultipleOf4(uint256 votes);
  error TallySlashingProposer__SlashAmountMustBeGtZero(string info);

  // SlashPayloadLib
  error SlashPayload_ArraySizeMismatch(uint256 expected, uint256 actual);

  // OpenZeppelin dependencies

  // ECDSA
  error ECDSAInvalidSignature();
  error ECDSAInvalidSignatureLength(uint256 length);
  error ECDSAInvalidSignatureS(bytes32 s);

  // Ownable
  error OwnableUnauthorizedAccount(address account);
  error OwnableInvalidOwner(address owner);

  // Checkpoints
  error CheckpointUnorderedInsertion();

  // ERC20
  error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);
  error ERC20InvalidSender(address sender);
  error ERC20InvalidReceiver(address receiver);
  error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);
  error ERC20InvalidApprover(address approver);
  error ERC20InvalidSpender(address spender);

  // SafeCast
  error SafeCastOverflowedUintDowncast(uint8 bits, uint256 value);
  error SafeCastOverflowedIntToUint(int256 value);
  error SafeCastOverflowedIntDowncast(uint8 bits, int256 value);
  error SafeCastOverflowedUintToInt(uint256 value);
}
