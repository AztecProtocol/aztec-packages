// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";
import {RollupBase, IInstance} from "./base/RollupBase.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RollupBuilder} from "./builder/RollupBuilder.sol";
import {EthValue, GenesisState} from "@aztec/core/interfaces/IRollup.sol";

import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

// solhint-disable comprehensive-interface

/**
 * @notice Exercises the field-range checks added to ProposeLib.
 *
 * A malicious proposer could previously store header or archive field values that are >= the BN254 scalar field
 * modulus on L1. Off-chain archivers decode those slots into `Fr`, and an out-of-range value bricks their L1 sync.
 * The checks reject such values at propose time; these tests cover the boundary (`P`), the extreme
 * (`type(uint256).max`), and that an otherwise-valid header with every checked field at `P - 1` still goes through.
 */
contract RollupFieldRangeTest is RollupBase {
  uint256 internal constant FIELD_MAX = Constants.P - 1;

  string internal constant FIXTURE = "mixed_checkpoint_1";

  uint256 internal SLOT_DURATION;

  modifier setUp() {
    {
      DecoderBase.Full memory full = load(FIXTURE);
      uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
      uint256 initialTime = Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    RollupBuilder builder =
      new RollupBuilder(address(this)).setTargetCommitteeSize(0).setProvingCostPerMana(EthValue.wrap(1000));
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    inbox = Inbox(address(rollup.getInbox()));
    _;
  }

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
  }

  // ----- archive (checked in propose, before validateHeader) -----

  function testRevertsArchiveAtModulus() public setUp {
    _expectFieldOutOfRange(_baseArgs(Constants.P, false), bytes32(Constants.P));
  }

  function testRevertsArchiveAtUintMax() public setUp {
    _expectFieldOutOfRange(_baseArgs(type(uint256).max, false), bytes32(type(uint256).max));
  }

  // ----- blockHeadersHash -----

  function testRevertsBlockHeadersHashAtModulus() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.blockHeadersHash = bytes32(Constants.P);
    _expectFieldOutOfRange(args, bytes32(Constants.P));
  }

  function testRevertsBlockHeadersHashAtUintMax() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.blockHeadersHash = bytes32(type(uint256).max);
    _expectFieldOutOfRange(args, bytes32(type(uint256).max));
  }

  // ----- outHash -----

  function testRevertsOutHashAtModulus() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.outHash = bytes32(Constants.P);
    _expectFieldOutOfRange(args, bytes32(Constants.P));
  }

  function testRevertsOutHashAtUintMax() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.outHash = bytes32(type(uint256).max);
    _expectFieldOutOfRange(args, bytes32(type(uint256).max));
  }

  // ----- feeRecipient -----

  function testRevertsFeeRecipientAtModulus() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.feeRecipient = bytes32(Constants.P);
    _expectFieldOutOfRange(args, bytes32(Constants.P));
  }

  function testRevertsFeeRecipientAtUintMax() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.feeRecipient = bytes32(type(uint256).max);
    _expectFieldOutOfRange(args, bytes32(type(uint256).max));
  }

  // ----- accumulatedFees -----

  function testRevertsAccumulatedFeesAtModulus() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.accumulatedFees = Constants.P;
    _expectFieldOutOfRange(args, bytes32(Constants.P));
  }

  function testRevertsAccumulatedFeesAtUintMax() public setUp {
    ProposeArgs memory args = _baseArgs(0, true);
    args.header.accumulatedFees = type(uint256).max;
    _expectFieldOutOfRange(args, bytes32(type(uint256).max));
  }

  // ----- genesis archive root (checked in STFLib.initialize at deploy time) -----

  function testRevertsGenesisArchiveRootOutOfRange() public {
    GenesisState memory genesis = TestConstants.getGenesisState();
    genesis.genesisArchiveRoot = bytes32(Constants.P);

    RollupBuilder builder = new RollupBuilder(address(this)).setTargetCommitteeSize(0).setGenesisState(genesis);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__FieldElementOutOfRange.selector, bytes32(Constants.P)));
    builder.deploy();
  }

  // ----- happy path: every checked field at P - 1 must not trip the range check -----

  /**
   * @notice A fully valid propose where each checked field is at the largest in-range value (`P - 1`) must succeed,
   *         proving the boundary is exclusive and the checks do not reject legitimate field elements.
   */
  function testAcceptsAllFieldsAtModulusMinusOne() public setUp {
    DecoderBase.Full memory full = load(FIXTURE);
    ProposedHeader memory header = full.checkpoint.header;

    // Pin the header to a valid slot/fee/inbox/coinbase configuration so the only remaining question is whether the
    // range checks accept the boundary values below.
    Slot slotNumber = Slot.wrap(1);
    Timestamp ts = rollup.getTimestampForSlot(slotNumber);
    header.timestamp = ts;
    header.slotNumber = slotNumber;
    header.coinbase = address(bytes20("sequencer"));

    vm.warp(max(block.timestamp, Timestamp.unwrap(ts)));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);
    header.inHash = rollup.getInbox().getRoot(full.checkpoint.checkpointNumber);
    header.gasFees.feePerL2Gas = SafeCast.toUint128(rollup.getManaMinFeeAt(ts, true));

    // Every field the range check guards, set to the maximal in-range value.
    header.blockHeadersHash = bytes32(FIELD_MAX);
    header.outHash = bytes32(FIELD_MAX);
    header.feeRecipient = bytes32(FIELD_MAX);
    header.accumulatedFees = FIELD_MAX;

    vm.blobhashes(this.getBlobHashes(full.checkpoint.blobCommitments));

    ProposeArgs memory args = ProposeArgs({header: header, archive: bytes32(FIELD_MAX), oracleInput: OracleInput(0)});

    rollup.propose(
      args,
      AttestationLibHelper.packAttestations(attestations),
      signers,
      attestationsAndSignersSignature,
      full.checkpoint.blobCommitments
    );

    assertEq(rollup.archive(), args.archive, "archive at P - 1 should have been stored");
  }

  /// @dev Builds propose args for the boundary tests with a valid slot/timestamp but skipped blob check.
  function _baseArgs(uint256 _archive, bool _useFixtureArchive) internal returns (ProposeArgs memory) {
    DecoderBase.Full memory full = load(FIXTURE);
    ProposedHeader memory header = full.checkpoint.header;

    Slot slotNumber = Slot.wrap(1);
    Timestamp ts = rollup.getTimestampForSlot(slotNumber);
    header.timestamp = ts;
    header.slotNumber = slotNumber;

    vm.warp(max(block.timestamp, Timestamp.unwrap(ts)));
    skipBlobCheck(address(rollup));

    bytes32 archive = _useFixtureArchive ? full.checkpoint.archive : bytes32(_archive);
    return ProposeArgs({header: header, archive: archive, oracleInput: OracleInput(0)});
  }

  function _expectFieldOutOfRange(ProposeArgs memory _args, bytes32 _value) internal {
    // Resolve everything that needs cheatcodes (loading the fixture, packing attestations) BEFORE arming
    // expectRevert, otherwise those cheatcode calls are mistaken for the call under test.
    bytes memory blobCommitments = load(FIXTURE).checkpoint.blobCommitments;
    CommitteeAttestations memory packed = AttestationLibHelper.packAttestations(attestations);
    address[] memory localSigners = signers;
    Signature memory sig = attestationsAndSignersSignature;

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__FieldElementOutOfRange.selector, _value));
    rollup.propose(_args, packed, localSigners, sig, blobCommitments);
  }
}
