// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {ValidatorSelectionTestBase} from "@test/validator-selection/ValidatorSelectionBase.sol";
import {DecoderBase} from "@test/base/DecoderBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Epoch, Slot, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {ProposedHeader, ProposedHeaderLib, GasFees} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ProposeArgs, OracleInput, ProposeLib, ProposePayload} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {
  CommitteeAttestations,
  CommitteeAttestation,
  Signature,
  AttestationLib
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {CheckpointLog, SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Strings} from "@oz/utils/Strings.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

/**
 * @title EscapeHatchIntegrationBase
 * @notice Base contract for EscapeHatch integration tests
 * @dev Provides common setup, configuration, and helper functions for integration tests
 */
abstract contract EscapeHatchIntegrationBase is ValidatorSelectionTestBase {
  using MessageHashUtils for bytes32;
  // ============ Escape Hatch Configuration ============
  uint96 internal constant DEFAULT_BOND_SIZE = 100e18;
  uint96 internal constant DEFAULT_WITHDRAWAL_TAX = 1e18;
  uint96 internal constant DEFAULT_FAILED_HATCH_PUNISHMENT = 10e18;
  uint256 internal constant DEFAULT_FREQUENCY = 35;
  uint256 internal constant DEFAULT_ACTIVE_DURATION = 2;
  uint256 internal constant DEFAULT_LAG_IN_HATCHES = 1;
  uint256 internal constant DEFAULT_PROPOSING_EXIT_DELAY = 0;

  // ============ Test State ============
  EscapeHatch internal escapeHatch;
  Hatch internal targetHatch;
  DecoderBase.Full internal full;

  // Test addresses
  address internal CANDIDATE1 = makeAddr("CANDIDATE1");
  address internal CANDIDATE2 = makeAddr("CANDIDATE2");
  address internal CANDIDATE3 = makeAddr("CANDIDATE3");

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;

  // ============ Setup Helpers ============

  constructor() {
    _setRandomPrevrandao();
  }

  /**
   * @notice Deploy and configure escape hatch with rollup
   */
  function _deployEscapeHatch() internal {
    SLOT_DURATION = rollup.getSlotDuration();
    EPOCH_DURATION = rollup.getEpochDuration() * SLOT_DURATION;

    escapeHatch = new EscapeHatch(
      address(rollup),
      address(testERC20),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      DEFAULT_ACTIVE_DURATION,
      DEFAULT_LAG_IN_HATCHES,
      DEFAULT_PROPOSING_EXIT_DELAY
    );

    vm.label(address(escapeHatch), "EscapeHatch");
    vm.label(CANDIDATE1, "Candidate1");
    vm.label(CANDIDATE2, "Candidate2");
    vm.label(CANDIDATE3, "Candidate3");

    address rollupOwner = Ownable(address(rollup)).owner();
    vm.expectEmit(true, true, true, true, address(rollup));
    emit IValidatorSelectionCore.EscapeHatchUpdated(address(escapeHatch));
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(escapeHatch));
  }

  /**
   * @notice Have a candidate join the escape hatch set
   * @dev Automatically ensures we're at a safe epoch to avoid HatchTooEarly errors
   */
  function _joinCandidateSet(address _candidate) internal {
    _warpToSafeEpoch();
    vm.prank(testERC20.owner());
    testERC20.mint(_candidate, DEFAULT_BOND_SIZE);
    vm.prank(_candidate);
    testERC20.approve(address(escapeHatch), DEFAULT_BOND_SIZE);
    vm.prank(_candidate);
    escapeHatch.joinCandidateSet();
  }

  /**
   * @notice Warp forward and select candidates with randomness
   * @dev Sets random prevrandao before warping to ensure varied candidate selection.
   *      Warps forward by DEFAULT_FREQUENCY epochs to ensure candidates are in the snapshot.
   * @return The prepared hatch number
   */
  function _selectCandidateForHatch() internal returns (Hatch) {
    _setRandomPrevrandao();
    _warpForwardEpochs(DEFAULT_FREQUENCY);
    escapeHatch.selectCandidates();

    Hatch currentHatch = escapeHatch.getHatch(rollup.getCurrentEpoch());
    return currentHatch + Hatch.wrap(escapeHatch.getLagInHatches());
  }

  // ============ Propose Helpers ============

  /**
   * @notice Build ProposeArgs for a checkpoint proposal
   * @param _proposer The proposer's address (used as coinbase)
   * @return args The ProposeArgs ready to use with rollup.propose()
   * @return blobs The blob commitments from the fixture
   *
   * @dev Uses:
   *   - archive: GENESIS_ARCHIVE_ROOT
   *   - oracleInput: zero
   *   - header fields from fixture for blockHeadersHash/blobsHash/inHash/outHash, rest overridden
   */
  function _buildProposeArgs(address _proposer) internal view returns (ProposeArgs memory args, bytes memory blobs) {
    bytes32 archive = bytes32(Constants.GENESIS_ARCHIVE_ROOT);
    Slot slotNumber = rollup.getCurrentSlot();

    // Build header fresh, only copying blockHeadersHash/blobsHash/inHash/outHash from fixture
    ProposedHeader memory header = ProposedHeader({
      lastArchiveRoot: archive,
      blockHeadersHash: full.checkpoint.header.blockHeadersHash,
      blobsHash: full.checkpoint.header.blobsHash,
      inHash: full.checkpoint.header.inHash,
      outHash: full.checkpoint.header.outHash,
      slotNumber: slotNumber,
      timestamp: rollup.getTimestampForSlot(slotNumber),
      coinbase: _proposer,
      feeRecipient: bytes32(0),
      gasFees: GasFees({
        feePerDaGas: 0, feePerL2Gas: uint128(rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true))
      }),
      totalManaUsed: 0
    });

    args = ProposeArgs({header: header, archive: archive, oracleInput: OracleInput({feeAssetPriceModifier: 0})});

    blobs = full.checkpoint.blobCommitments;
  }

  /**
   * @notice Propose a block as an escape hatch proposer (no committee attestations)
   * @param _proposer The escape hatch proposer address
   * @return archive The archive root that was proposed
   */
  function _proposeWithHatch(address _proposer) internal returns (bytes32 archive) {
    (ProposeArgs memory args, bytes memory blobs) = _buildProposeArgs(_proposer);

    skipBlobCheck(address(rollup));

    vm.prank(_proposer);
    rollup.propose(
      args,
      CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
      new address[](0),
      Signature({v: 0, r: 0, s: 0}),
      blobs
    );

    return args.archive;
  }

  /**
   * @notice Propose a block with proper committee attestations
   * @return archive The archive root that was proposed
   * @return attestations The attestations used (useful for proof submission)
   */
  function _proposeWithCommittee() internal returns (bytes32 archive, CommitteeAttestation[] memory attestations) {
    ProposedHeader memory header = full.checkpoint.header;
    header.slotNumber = rollup.getCurrentSlot();
    header.timestamp = rollup.getTimestampForSlot(header.slotNumber);

    rollup.setupEpoch();

    address proposer = rollup.getCurrentProposer();
    address[] memory committee = rollup.getEpochCommittee(rollup.getCurrentEpoch());

    // Update header with current values
    {
      uint128 manaMinFee = SafeCast.toUint128(rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true));
      header.gasFees.feePerL2Gas = manaMinFee;
    }

    ProposeArgs memory proposeArgs =
      ProposeArgs({header: header, archive: full.checkpoint.archive, oracleInput: OracleInput(0)});

    skipBlobCheck(address(rollup));

    // Build propose payload for signing
    ProposePayload memory proposePayload = ProposePayload({
      archive: proposeArgs.archive, oracleInput: proposeArgs.oracleInput, headerHash: ProposedHeaderLib.hash(header)
    });

    // Create all valid attestations
    uint256 committeeSize = committee.length;
    attestations = new CommitteeAttestation[](committeeSize);
    address[] memory signers = new address[](committeeSize);
    bytes32 digest = ProposeLib.digest(proposePayload);

    for (uint256 i = 0; i < committeeSize; i++) {
      attestations[i] = _createAttestation(committee[i], digest);
      signers[i] = committee[i];
    }

    // Proposer signs over attestations and signers
    Signature memory attestationsAndSignersSignature =
    _createAttestation(
      proposer,
      AttestationLib.getAttestationsAndSignersDigest(AttestationLibHelper.packAttestations(attestations), signers)
    ).signature;

    // Propose the checkpoint
    vm.prank(proposer);
    rollup.propose(
      proposeArgs,
      AttestationLibHelper.packAttestations(attestations),
      signers,
      attestationsAndSignersSignature,
      full.checkpoint.blobCommitments
    );

    return (proposeArgs.archive, attestations);
  }

  /**
   * @notice Create a signed attestation for a committee member
   */
  function _createAttestation(address _signer, bytes32 _digest) internal view returns (CommitteeAttestation memory) {
    uint256 privateKey = attesterPrivateKeys[_signer];

    bytes32 digest = _digest.toEthSignedMessageHash();
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    Signature memory signature = Signature({v: v, r: r, s: s});
    return CommitteeAttestation({addr: _signer, signature: signature});
  }

  // ============ Randomness Helpers ============

  /**
   * @notice Set a random prevrandao value for varied candidate selection
   * @dev Should be called before warping to epochs where randao checkpoint happens.
   *      The randao is checkpointed during setupEpoch() calls, so this should be
   *      called before any time warping that would trigger checkpointing.
   */
  function _setRandomPrevrandao() internal {
    vm.prevrandao(vm.randomUint());
  }

  // ============ Time Helpers ============

  /**
   * @notice Ensures we're at a safe epoch where joinCandidateSet won't revert with HatchTooEarly
   * @dev Only warps forward if needed - never goes backwards in time
   */
  function _warpToSafeEpoch() internal {
    uint256 safeEpoch = DEFAULT_LAG_IN_HATCHES * DEFAULT_FREQUENCY;
    if (Epoch.unwrap(rollup.getCurrentEpoch()) < safeEpoch) {
      _warpToEpoch(safeEpoch);
    }
  }

  function _warpToEpoch(uint256 _epochNumber) internal {
    Timestamp ts = rollup.getTimestampForEpoch(Epoch.wrap(_epochNumber));
    vm.warp(Timestamp.unwrap(ts));
  }

  function _warpForwardEpochs(uint256 _numEpochs) internal {
    vm.warp(block.timestamp + _numEpochs * EPOCH_DURATION);
  }

  function _warpToExitableAt(address _candidate) internal {
    CandidateInfo memory info = escapeHatch.getCandidateInfo(_candidate);
    vm.warp(info.exitableAt);
  }

  function _warpToHatch(Hatch _hatch) internal {
    Epoch firstEpochOfHatch = escapeHatch.getFirstEpoch(_hatch);
    _warpToEpoch(Epoch.unwrap(firstEpochOfHatch));
  }

  // ============ Proof Submission Helpers ============

  /**
   * @notice Submit proofs for checkpoints
   * @param _name Base name of fixture files (e.g., "empty_checkpoint_")
   * @param _start Starting checkpoint number
   * @param _end Ending checkpoint number
   * @param _prover Address of the prover
   */
  function _proveCheckpoints(string memory _name, uint256 _start, uint256 _end, address _prover) internal {
    DecoderBase.Full memory endFull = load(string.concat(_name, Strings.toString(_end)));

    bytes32 previousArchive = rollup.archiveAt(_start - 1);
    bytes32 endArchive = rollup.archiveAt(_end);

    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: previousArchive, endArchive: endArchive, outHash: bytes32(0), proverId: _prover
    });

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);
    uint256 size = _end - _start + 1;
    for (uint256 i = 0; i < size; i++) {
      fees[i * 2] = bytes32(uint256(uint160(bytes20(("sequencer")))));
      fees[i * 2 + 1] = bytes32(0);
    }

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: _start,
        end: _end,
        args: args,
        fees: fees,
        attestations: CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
        blobInputs: endFull.checkpoint.batchedBlobInputs,
        proof: ""
      })
    );
  }
}
