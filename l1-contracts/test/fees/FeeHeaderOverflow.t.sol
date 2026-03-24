// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";
import {Config, RollupBuilder} from "../builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {IRollup, RollupConfigInput, EthValue, EthPerFeeAssetE12} from "@aztec/core/interfaces/IRollup.sol";
import {FeeHeader, FeeHeaderLib, CompressedFeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {EconomicsInitArgs, ManaMinFeeComponents, OracleInput} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {CommitteeAttestation, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {console} from "forge-std/console.sol";

/**
 * @title FeeHeaderOverflowTest
 * @notice Demonstrates four overflow vectors in the fee computation path that prevent
 *         checkpoint proposals when triggered, creating a liveness risk.
 *
 *   1. FeeHeader compression - proverCost (uint63): can exceed its bit width because
 *      the FeeConfig allows provingCostPerMana up to uint64. Governance can set a
 *      valid config value that always reverts during compression.
 *
 *   2. FeeHeader compression - congestionCost (uint64): with a cheap fee asset (low
 *      ethPerFeeAsset) and moderate congestion, the fee-asset conversion amplifies
 *      the congestion cost beyond 64 bits.
 *
 *   3. fakeExponential overflow: the Taylor series computation in congestionMultiplier
 *      uses checked arithmetic that reverts when excessMana is large enough (~1000x target).
 *      Once this happens, the system is permanently stuck - no checkpoint can be proposed,
 *      so excessMana can never decrease.
 *
 *   4. FeeHeader compression - excessMana (uint48): when the parent header has
 *      excessMana near the uint48 maximum and manaUsed exceeds manaTarget, the
 *      computed excessMana for the next checkpoint overflows 48 bits. Since
 *      excessMana depends entirely on the parent header (committed state), no
 *      proposer can work around the revert - permanent liveness failure.
 *
 *   Additionally, even after fixing (1)-(4), the summed mana min fee (sequencerCost +
 *   proverCost + congestionCost) can exceed the uint128 capacity of the proposal header's
 *   feePerL2Gas field. Without capping summedMinFee at type(uint128).max, the proposer
 *   cannot construct a valid header, causing the same liveness failure.
 */
contract FeeHeaderOverflowTest is DecoderBase {
  using TimeLib for Timestamp;

  using SafeCast for uint256;
  using FeeHeaderLib for CompressedFeeHeader;

  DecoderBase.Full full = load("empty_checkpoint_1");

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;
  uint256 internal constant MANA_TARGET = 100_000_000;

  address internal coinbase;
  uint256 internal constant MAX_PROVER_COST = (1 << 63) - 1;
  uint256 internal constant MAX_CONGESTION_COST = type(uint64).max;

  function _economics(Rollup _rollup) internal view returns (IEconomics) {
    return IEconomics(address(_rollup.getEconomicsForEpoch(_rollup.getCurrentEpoch())));
  }

  function _checkpointOfInterest(Rollup _rollup, Timestamp _timestamp) internal view returns (uint256) {
    return
      _rollup.canPruneAtTime(_timestamp) ? _rollup.getProvenCheckpointNumber() : _rollup.getPendingCheckpointNumber();
  }

  function _getManaMinFeeAt(Rollup _rollup, Timestamp _timestamp, bool _inFeeAsset) internal view returns (uint256) {
    IEconomics economics = IEconomics(address(_rollup.getEconomicsForEpoch(_rollup.getEpochAt(_timestamp))));
    return
      economics.getProposalFeeParameters(_checkpointOfInterest(_rollup, _timestamp), _timestamp, _inFeeAsset).manaMinFee;
  }

  function setUp() public {
    // Warp to a timestamp large enough so that setupEpoch's
    // stableEpochToValidatorSetSampleTime doesn't underflow when subtracting
    // lagInEpochsForValidatorSet * epochDurationInSeconds from genesis timestamp.
    vm.warp(SLOT_DURATION * EPOCH_DURATION * 5);
    coinbase = makeAddr("MONEY MAKER");
  }

  function _deployRollup(RollupConfigInput memory _config) internal returns (Rollup) {
    RollupBuilder builder = new RollupBuilder(address(this)).setRollupConfigInput(_config).setMintFeeAmount(1e30);
    builder.deploy();
    Config memory config = builder.getConfig();
    Rollup rollup = Rollup(address(builder.getConfig().rollup));
    EconomicsHarness helper = new EconomicsHarness(
      address(this),
      address(rollup),
      config.testERC20,
      EconomicsInitArgs({
        manaTarget: config.rollupConfigInput.manaTarget,
        provingCostPerMana: config.rollupConfigInput.provingCostPerMana,
        initialEthPerFeeAsset: config.rollupConfigInput.initialEthPerFeeAsset,
        rewardConfig: config.rollupConfigInput.rewardConfig,
        rewardBoostConfig: config.rollupConfigInput.rewardBoostConfig,
        genesisTime: block.timestamp,
        aztecSlotDuration: config.rollupConfigInput.aztecSlotDuration,
        aztecEpochDuration: config.rollupConfigInput.aztecEpochDuration,
        aztecProofSubmissionEpochs: config.rollupConfigInput.aztecProofSubmissionEpochs
      })
    );
    vm.etch(address(_economics(rollup)), address(helper).code);
    vm.label(address(rollup), "ROLLUP");
    return rollup;
  }

  /**
   * @notice Construct a proposal that passes header validation, using the fixture template.
   */
  function _buildProposal(Rollup _rollup, uint256 _manaMinFee)
    internal
    view
    returns (ProposeArgs memory, CommitteeAttestations memory, address[] memory)
  {
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);
    ProposedHeader memory header = full.checkpoint.header;
    Slot slotNumber = _rollup.getCurrentSlot();

    header.lastArchiveRoot = archiveRoot;
    header.slotNumber = slotNumber;
    header.timestamp = _rollup.getTimestampForSlot(slotNumber);
    header.coinbase = coinbase;
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = _manaMinFee.toUint128();
    header.gasFees.feePerDaGas = 0;
    header.totalManaUsed = 0;

    CommitteeAttestation[] memory attestations = new CommitteeAttestation[](0);
    address[] memory signers = new address[](0);

    return (
      ProposeArgs({header: header, archive: archiveRoot, oracleInput: OracleInput({feeAssetPriceModifier: 0})}),
      AttestationLibHelper.packAttestations(attestations),
      signers
    );
  }

  function _proposeEmptyCheckpoint(Rollup _rollup, uint256 _manaMinFee) internal {
    (ProposeArgs memory proposeArgs, CommitteeAttestations memory attestations, address[] memory signers) =
      _buildProposal(_rollup, _manaMinFee);

    skipBlobCheck(address(_rollup));
    _rollup.propose(proposeArgs, attestations, signers, Signature({v: 0, r: 0, s: 0}), full.checkpoint.blobCommitments);
  }

  // -----------------------------------------------------------------------
  //  1. Compression overflow - provingCostPerMana exceeds 63-bit proverCost
  // -----------------------------------------------------------------------

  /**
   * @notice FeeConfig stores provingCostPerMana as uint64, but FeeHeader compresses
   *         proverCost as 63 bits. Setting provingCostPerMana between 2^63 and 2^64-1
   *         produces a proverCost that always overflows during compression.
   *         This demonstrates that governance can set a valid-looking config value
   *         that permanently bricks proposal submission.
   *         The brick can occur even if the "actual" provercostPerMana is in the range,
   *         because the final proving prover cost also includes the L1 component.
   */
  function test_propose_compressOverflow_provingCost() public {
    // 2^63 fits in uint64 (FeeConfig) but exceeds uint63 (FeeHeader)
    EthValue provingCostPerMana = EthValue.wrap((1 << 63));

    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    config.provingCostPerMana = provingCostPerMana;
    // 1:1 ETH/AZTEC parity so proverCost (fee asset) = proverCostPerMana (wei)
    config.initialEthPerFeeAsset = EthPerFeeAssetE12.wrap(1e12);
    config.targetCommitteeSize = 0;

    Rollup rollup = _deployRollup(config);

    // Warp to slot 1
    vm.warp(block.timestamp + SLOT_DURATION);

    // The fee computation succeeds because intermediate values are uint256
    ManaMinFeeComponents memory components = _economics(rollup)
      .getManaMinFeeComponentsAt(
        _checkpointOfInterest(rollup, Timestamp.wrap(block.timestamp)), Timestamp.wrap(block.timestamp), true
      );
    uint256 manaMinFee = _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true);

    assertTrue(components.proverCost > MAX_PROVER_COST, "proverCost should exceed 63-bit limit");

    (ProposeArgs memory proposeArgs, CommitteeAttestations memory attestations, address[] memory signers) =
      _buildProposal(rollup, manaMinFee);

    skipBlobCheck(address(rollup));

    // propose succeeds because compress() caps proverCost at 63-bit max instead of reverting.
    rollup.propose(proposeArgs, attestations, signers, Signature({v: 0, r: 0, s: 0}), full.checkpoint.blobCommitments);

    // Verify the stored fee header has capped proverCost
    FeeHeader memory storedFeeHeader = _economics(rollup).getFeeHeader(1);
    assertEq(storedFeeHeader.proverCost, MAX_PROVER_COST, "stored proverCost should be capped at 63-bit max");
    assertEq(storedFeeHeader.congestionCost, 0, "congestionCost should be zero (no congestion)");
  }

  // -----------------------------------------------------------------------
  //  2. Compression overflow - congestionCost exceeds 64 bits
  // -----------------------------------------------------------------------

  /**
   * @notice With a cheap fee asset (ethPerFeeAsset = 100, minimum) and moderate congestion
   *         (excessMana = 1e10, ~100x target), the congestion cost in fee asset exceeds
   *         the 64-bit limit during FeeHeader compression.
   *
   *         The cheap token amplifies ETH values by 1e10 when converting to fee asset.
   *         Combined with a congestion multiplier of ~120,000x (from e^11.7),
   *         the congestion cost reaches ~3.6e21 - far above uint64 max (~1.84e19).
   *
   *         Note: proverCost stays within 63 bits here because provingCostPerMana is
   *         at the default (100 wei), so this specifically tests the congestion path.
   */
  function test_propose_compressOverflow_congestionCost() public {
    // excessMana = 1e10 (~100x target): high enough for large congestion multiplier,
    // but well below the ~975x threshold that would overflow fakeExponential
    uint256 excessMana = 10_000_000_000;

    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    // Minimum ethPerFeeAsset: AZTEC is nearly worthless, amplifies conversion by 1e10
    config.initialEthPerFeeAsset = EthPerFeeAssetE12.wrap(100);
    config.targetCommitteeSize = 0;

    Rollup rollup = _deployRollup(config);

    vm.warp(block.timestamp + SLOT_DURATION);
    _proposeEmptyCheckpoint(rollup, _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true));

    EconomicsHarness(address(_economics(rollup)))
      .setFeeHeader(
        1, FeeHeader({excessMana: excessMana, manaUsed: 0, ethPerFeeAsset: 100, congestionCost: 0, proverCost: 0})
      );

    // Verify the modification
    FeeHeader memory modifiedFeeHeader = _economics(rollup).getFeeHeader(1);
    assertEq(modifiedFeeHeader.excessMana, excessMana, "excessMana not set correctly");
    assertEq(modifiedFeeHeader.ethPerFeeAsset, 100, "ethPerFeeAsset not set correctly");

    // Warp to slot 2
    vm.warp(block.timestamp + SLOT_DURATION);

    // Fee computation succeeds (uint256 intermediates), but congestionCost exceeds uint64
    ManaMinFeeComponents memory components = _economics(rollup)
      .getManaMinFeeComponentsAt(
        _checkpointOfInterest(rollup, Timestamp.wrap(block.timestamp)), Timestamp.wrap(block.timestamp), true
      );
    uint256 manaMinFee = _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true);

    assertTrue(components.congestionCost > MAX_CONGESTION_COST, "congestionCost should exceed 64-bit limit");
    assertTrue(components.proverCost <= MAX_PROVER_COST, "proverCost should still fit in 63 bits");

    // propose succeeds because compress() caps congestionCost at 64-bit max instead of reverting.
    _proposeEmptyCheckpoint(rollup, manaMinFee);

    // Verify the stored fee header has capped congestionCost
    FeeHeader memory storedFeeHeader = _economics(rollup).getFeeHeader(2);
    assertEq(
      storedFeeHeader.congestionCost, MAX_CONGESTION_COST, "stored congestionCost should be capped at 64-bit max"
    );
    assertLe(storedFeeHeader.proverCost, MAX_PROVER_COST, "proverCost should still fit in 63 bits");
  }

  // -----------------------------------------------------------------------
  //  3. fakeExponential overflow - congestionMultiplier() reverts
  // -----------------------------------------------------------------------

  /**
   * @notice When excessMana accumulates to ~1000x the mana target, the Taylor series in
   *         fakeExponential would overflow uint256 without the cap in congestionMultiplier().
   *
   *         After fix: Three caps work together to keep the system live:
   *         1. congestionMultiplier() caps the exponent at 100 (prevents Taylor series overflow)
   *         2. summedMinFee() caps the total fee at uint128 max (ensures header representability)
   *         3. compress() caps individual fields (prevents fee header compression overflow)
   *
   *         We simulate the accumulated excess by directly writing to the genesis fee header's
   *         storage slot, which is equivalent to ~1000 consecutive max-capacity checkpoints.
   */
  function test_propose_fakeExponentialOverflow() public {
    // 1e11 is ~1000x the mana target (1e8), enough to overflow fakeExponential without cap
    uint256 excessMana = 100_000_000_000;

    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    config.targetCommitteeSize = 0;

    Rollup rollup = _deployRollup(config);

    vm.warp(block.timestamp + SLOT_DURATION);
    _proposeEmptyCheckpoint(rollup, _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true));

    uint256 ethPerFeeAsset = EthPerFeeAssetE12.unwrap(config.initialEthPerFeeAsset);

    EconomicsHarness(address(_economics(rollup)))
      .setFeeHeader(
        1,
        FeeHeader({
          excessMana: excessMana, manaUsed: 0, ethPerFeeAsset: ethPerFeeAsset, congestionCost: 0, proverCost: 0
        })
      );

    // Verify the modification
    FeeHeader memory modifiedFeeHeader = _economics(rollup).getFeeHeader(1);
    assertEq(modifiedFeeHeader.excessMana, excessMana, "excessMana not set correctly");
    assertEq(modifiedFeeHeader.ethPerFeeAsset, ethPerFeeAsset, "ethPerFeeAsset changed unexpectedly");

    // Warp to slot 2
    vm.warp(block.timestamp + SLOT_DURATION);

    // The congestionMultiplier is capped at e^100 instead of overflowing the Taylor series.
    ManaMinFeeComponents memory components = _economics(rollup)
      .getManaMinFeeComponentsAt(
        _checkpointOfInterest(rollup, Timestamp.wrap(block.timestamp)), Timestamp.wrap(block.timestamp), true
      );
    uint256 manaMinFee = _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true);

    // The congestion multiplier is capped (excessMana > denominator * 100 threshold)
    assertTrue(components.congestionMultiplier > 0, "congestionMultiplier should be non-zero");
    // Individual components exceed their compressed field widths
    assertTrue(components.congestionCost > MAX_CONGESTION_COST, "congestionCost exceeds 64-bit limit");

    // summedMinFee caps the total at uint128 max, ensuring the header can represent it
    assertEq(manaMinFee, type(uint128).max, "mana min fee should be capped at uint128 max");

    // Propose succeeds: all three caps work together
    // propose succeeds because congestionMultiplier is capped (no Taylor overflow),
    // summedMinFee is capped at uint128 max (valid header), and compress caps individual fields.
    _proposeEmptyCheckpoint(rollup, manaMinFee);

    // Verify the stored fee header has capped values
    FeeHeader memory storedFeeHeader = _economics(rollup).getFeeHeader(2);
    assertEq(
      storedFeeHeader.congestionCost, MAX_CONGESTION_COST, "stored congestionCost should be capped at 64-bit max"
    );
    assertLe(storedFeeHeader.proverCost, MAX_PROVER_COST, "proverCost should fit in 63 bits");
  }

  // -----------------------------------------------------------------------
  //  4. Compression overflow - excessMana exceeds 48-bit limit
  // -----------------------------------------------------------------------

  /**
   * @notice When the parent header has excessMana near the uint48 maximum and manaUsed
   *         exceeds manaTarget, the computed excessMana for the next checkpoint overflows
   *         48 bits during FeeHeader compression.
   *
   *         The new excessMana is computed as:
   *           clampedAdd(parent.excessMana + parent.manaUsed, -manaTarget)
   *
   *         With parent.excessMana = uint48 max and parent.manaUsed > manaTarget,
   *         the result exceeds uint48.
   *
   *         After fix: compress() caps excessMana at uint48 max (via Math.min) instead
   *         of reverting, consistent with the congestionCost and proverCost caps.
   *         At uint48 max, the congestion multiplier is already pinned at the e^100 cap,
   *         so capping excessMana doesn't change observable fee behavior. The system
   *         naturally recovers as manaUsed drops to 0 under extreme fees.
   *
   *         Reaching this state requires sustained extreme congestion (~2.8M consecutive
   *         full-capacity checkpoints at 1e8 target). The other overflow fixes (Taylor
   *         series cap, fee capping) ensure proposals succeed under extreme congestion,
   *         which allows excess to keep accumulating toward this boundary.
   */
  function test_propose_compressOverflow_excessMana() public {
    uint256 maxUint48 = type(uint48).max;
    // Parent header: excessMana at uint48 max, manaUsed at full capacity (2x target = mana limit)
    uint256 parentExcessMana = maxUint48;
    uint256 parentManaUsed = MANA_TARGET * 2;

    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    config.targetCommitteeSize = 0;

    Rollup rollup = _deployRollup(config);

    vm.warp(block.timestamp + SLOT_DURATION);
    _proposeEmptyCheckpoint(rollup, _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true));

    uint256 ethPerFeeAsset = EthPerFeeAssetE12.unwrap(config.initialEthPerFeeAsset);

    EconomicsHarness(address(_economics(rollup)))
      .setFeeHeader(
        1,
        FeeHeader({
          excessMana: parentExcessMana,
          manaUsed: parentManaUsed,
          ethPerFeeAsset: ethPerFeeAsset,
          congestionCost: 0,
          proverCost: 0
        })
      );

    // Verify the parent header was written correctly
    FeeHeader memory modified = _economics(rollup).getFeeHeader(1);
    assertEq(modified.excessMana, parentExcessMana, "parent excessMana not set correctly");
    assertEq(modified.manaUsed, parentManaUsed, "parent manaUsed not set correctly");

    // The new excessMana = parentExcessMana + parentManaUsed - manaTarget
    //                    = (2^48 - 1) + 2e8 - 1e8
    //                    = (2^48 - 1) + 1e8
    //                    > uint48 max
    uint256 expectedExcess = parentExcessMana + parentManaUsed - MANA_TARGET;
    assertTrue(expectedExcess > maxUint48, "computed excessMana should overflow uint48");

    // Warp to slot 2
    vm.warp(block.timestamp + SLOT_DURATION);

    // Fee queries still work (they operate on uint256 internally, no compression)
    uint256 manaMinFee = _getManaMinFeeAt(rollup, Timestamp.wrap(block.timestamp), true);

    // propose succeeds because compress() caps excessMana at uint48 max instead of reverting.
    _proposeEmptyCheckpoint(rollup, manaMinFee);

    // Verify the stored fee header has capped excessMana
    FeeHeader memory storedFeeHeader = _economics(rollup).getFeeHeader(2);
    assertEq(storedFeeHeader.excessMana, type(uint48).max, "stored excessMana should be capped at 48-bit max");
  }
}
