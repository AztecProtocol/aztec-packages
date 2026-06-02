// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollup, RollupConfigInput, EthValue, EthPerFeeAssetE12} from "@aztec/core/interfaces/IRollup.sol";
import {FeeHeader, FeeHeaderLib, CompressedFeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {FeeLib, OracleInput, ManaMinFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {CommitteeAttestation, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
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
  using SafeCast for uint256;
  using FeeHeaderLib for CompressedFeeHeader;

  DecoderBase.Full full = load("empty_checkpoint_1");

  uint256 internal constant SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
  uint256 internal constant EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
  uint256 internal constant MANA_TARGET = 100_000_000;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  uint256 internal constant MAX_PROVER_COST = (1 << 63) - 1;
  uint256 internal constant MAX_CONGESTION_COST = type(uint64).max;

  function setUp() public {
    // Warp to a timestamp large enough so that setupEpoch's
    // stableEpochToValidatorSetSampleTime doesn't underflow when subtracting
    // lagInEpochsForValidatorSet * epochDurationInSeconds from genesis timestamp.
    vm.warp(SLOT_DURATION * EPOCH_DURATION * 5);
  }

  function _deployRollup(RollupConfigInput memory _config) internal returns (Rollup) {
    RollupBuilder builder = new RollupBuilder(address(this)).setRollupConfigInput(_config).setMintFeeAmount(1e30);
    builder.deploy();
    Rollup rollup = Rollup(address(builder.getConfig().rollup));
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
    header.gasFees.feePerL2Gas = uint128(_manaMinFee);
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

  /**
   * @notice Compute the storage slot for a checkpoint's fee header in the circular buffer.
   *         Layout: STF namespaced storage -> tempCheckpointLogs mapping (offset 2) ->
   *         CompressedTempCheckpointLog struct -> feeHeader field (offset 6).
   */
  function _getFeeHeaderStorageSlot(uint256 _circularIndex) internal pure returns (bytes32) {
    bytes32 stfBase = keccak256("aztec.stf.storage");
    // tempCheckpointLogs mapping is at position 2 in RollupStore
    uint256 mappingSlot = uint256(stfBase) + 2;
    // Mapping key -> struct base slot
    bytes32 structBase = keccak256(abi.encode(_circularIndex, mappingSlot));
    // feeHeader is the 7th field (offset +6) of CompressedTempCheckpointLog
    return bytes32(uint256(structBase) + 6);
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
    // Deploy with a normal initial provingCostPerMana, then forcibly inject the oversized value
    // by overwriting the compressed FeeStore slot directly. The deploy-time ceiling
    // (MAX_INITIAL_PROVING_COST_PER_MANA) blocks (1 << 63) at construction; this test models the
    // post-deploy reality that governance updates have no absolute ceiling and the value can
    // drift past 2^63 over time, so the compress() guard still has to cope.
    // In practice, this will not happen because the deploy-time ceiling should make approaching
    // 2^63 infeasible.
    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    // 1:1 ETH/AZTEC parity so proverCost (fee asset) = proverCostPerMana (wei)
    config.initialEthPerFeeAsset = EthPerFeeAssetE12.wrap(1e12);
    config.targetCommitteeSize = 0;

    Rollup rollup = _deployRollup(config);

    // Overwrite the low 64 bits of the FeeStore's CompressedFeeConfig (slot 0 of the FeeLib
    // namespaced storage) with (1 << 63). The high 192 bits (manaTarget,
    // congestionUpdateFraction) stay intact.
    bytes32 feeStoreSlot = keccak256("aztec.fee.storage");
    uint256 existing = uint256(vm.load(address(rollup), feeStoreSlot));
    uint256 masked = existing & ~((uint256(1) << 64) - 1);
    uint256 newConfig = masked | (uint256(1) << 63);
    vm.store(address(rollup), feeStoreSlot, bytes32(newConfig));

    // Warp to slot 1
    vm.warp(block.timestamp + SLOT_DURATION);

    // The fee computation succeeds because intermediate values are uint256
    ManaMinFeeComponents memory components = rollup.getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
    uint256 manaMinFee = rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true);

    assertTrue(components.proverCost > MAX_PROVER_COST, "proverCost should exceed 63-bit limit");

    (ProposeArgs memory proposeArgs, CommitteeAttestations memory attestations, address[] memory signers) =
      _buildProposal(rollup, manaMinFee);

    skipBlobCheck(address(rollup));

    // propose succeeds because compress() caps proverCost at 63-bit max instead of reverting.
    rollup.propose(proposeArgs, attestations, signers, Signature({v: 0, r: 0, s: 0}), full.checkpoint.blobCommitments);

    // Verify the stored fee header has capped proverCost
    FeeHeader memory storedFeeHeader = rollup.getFeeHeader(1);
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

    // Overwrite checkpoint 0's fee header with high excessMana and low ethPerFeeAsset
    uint256 compressedValue = 0;
    compressedValue |= excessMana << 32;
    compressedValue |= uint256(100) << 80; // ethPerFeeAsset = 100 (minimum)
    compressedValue |= uint256(1) << 255; // preHeat bit

    bytes32 feeHeaderSlot = _getFeeHeaderStorageSlot(0);
    vm.store(address(rollup), feeHeaderSlot, bytes32(compressedValue));

    // Verify the modification
    FeeHeader memory modifiedFeeHeader = rollup.getFeeHeader(0);
    assertEq(modifiedFeeHeader.excessMana, excessMana, "excessMana not set correctly");
    assertEq(modifiedFeeHeader.ethPerFeeAsset, 100, "ethPerFeeAsset not set correctly");

    // Warp to slot 1
    vm.warp(block.timestamp + SLOT_DURATION);

    // Fee computation succeeds (uint256 intermediates), but congestionCost exceeds uint64
    ManaMinFeeComponents memory components = rollup.getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
    uint256 manaMinFee = rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true);

    assertTrue(components.congestionCost > MAX_CONGESTION_COST, "congestionCost should exceed 64-bit limit");
    assertTrue(components.proverCost <= MAX_PROVER_COST, "proverCost should still fit in 63 bits");

    (ProposeArgs memory proposeArgs, CommitteeAttestations memory attestations, address[] memory signers) =
      _buildProposal(rollup, manaMinFee);

    skipBlobCheck(address(rollup));

    // propose succeeds because compress() caps congestionCost at 64-bit max instead of reverting.
    rollup.propose(proposeArgs, attestations, signers, Signature({v: 0, r: 0, s: 0}), full.checkpoint.blobCommitments);

    // Verify the stored fee header has capped congestionCost
    FeeHeader memory storedFeeHeader = rollup.getFeeHeader(1);
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

    // Read the genesis fee header to get the ethPerFeeAsset value
    FeeHeader memory genesisFeeHeader = rollup.getFeeHeader(0);
    uint256 ethPerFeeAsset = genesisFeeHeader.ethPerFeeAsset;

    // Construct the modified CompressedFeeHeader with high excessMana.
    // Bit layout: manaUsed(32) | excessMana(48) | ethPerFeeAsset(48) |
    //             congestionCost(64) | proverCost(63) | preHeat(1)
    uint256 compressedValue = 0;
    compressedValue |= excessMana << 32;
    compressedValue |= ethPerFeeAsset << 80;
    compressedValue |= uint256(1) << 255; // preHeat bit

    // Overwrite checkpoint 0's fee header in the circular buffer via vm.store.
    // Checkpoint 0 maps to circular index 0.
    bytes32 feeHeaderSlot = _getFeeHeaderStorageSlot(0);
    vm.store(address(rollup), feeHeaderSlot, bytes32(compressedValue));

    // Verify the modification
    FeeHeader memory modifiedFeeHeader = rollup.getFeeHeader(0);
    assertEq(modifiedFeeHeader.excessMana, excessMana, "excessMana not set correctly");
    assertEq(modifiedFeeHeader.ethPerFeeAsset, ethPerFeeAsset, "ethPerFeeAsset changed unexpectedly");

    // Warp to slot 1
    vm.warp(block.timestamp + SLOT_DURATION);

    // The congestionMultiplier is capped at e^100 instead of overflowing the Taylor series.
    ManaMinFeeComponents memory components = rollup.getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
    uint256 manaMinFee = rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true);

    // The congestion multiplier is capped (excessMana > denominator * 100 threshold)
    assertTrue(components.congestionMultiplier > 0, "congestionMultiplier should be non-zero");
    // Individual components exceed their compressed field widths
    assertTrue(components.congestionCost > MAX_CONGESTION_COST, "congestionCost exceeds 64-bit limit");

    // summedMinFee caps the total at uint128 max, ensuring the header can represent it
    assertEq(manaMinFee, type(uint128).max, "mana min fee should be capped at uint128 max");

    // Propose succeeds: all three caps work together
    (ProposeArgs memory proposeArgs, CommitteeAttestations memory attestations, address[] memory signers) =
      _buildProposal(rollup, manaMinFee);

    skipBlobCheck(address(rollup));

    // propose succeeds because congestionMultiplier is capped (no Taylor overflow),
    // summedMinFee is capped at uint128 max (valid header), and compress caps individual fields.
    rollup.propose(proposeArgs, attestations, signers, Signature({v: 0, r: 0, s: 0}), full.checkpoint.blobCommitments);

    // Verify the stored fee header has capped values
    FeeHeader memory storedFeeHeader = rollup.getFeeHeader(1);
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

    // Read genesis ethPerFeeAsset for the compressed header construction
    FeeHeader memory genesisFeeHeader = rollup.getFeeHeader(0);
    uint256 ethPerFeeAsset = genesisFeeHeader.ethPerFeeAsset;

    // Construct parent header with near-max excessMana and manaUsed > manaTarget.
    // Bit layout: preHeat(1) | proverCost(63) | congestionCost(64) |
    //             ethPerFeeAsset(48) | excessMana(48) | manaUsed(32)
    uint256 compressedValue = 0;
    compressedValue |= parentManaUsed; // bits 0-31
    compressedValue |= parentExcessMana << 32; // bits 32-79
    compressedValue |= ethPerFeeAsset << 80; // bits 80-127
    compressedValue |= uint256(1) << 255; // preHeat bit

    bytes32 feeHeaderSlot = _getFeeHeaderStorageSlot(0);
    vm.store(address(rollup), feeHeaderSlot, bytes32(compressedValue));

    // Verify the parent header was written correctly
    FeeHeader memory modified = rollup.getFeeHeader(0);
    assertEq(modified.excessMana, parentExcessMana, "parent excessMana not set correctly");
    assertEq(modified.manaUsed, parentManaUsed, "parent manaUsed not set correctly");

    // The new excessMana = parentExcessMana + parentManaUsed - manaTarget
    //                    = (2^48 - 1) + 2e8 - 1e8
    //                    = (2^48 - 1) + 1e8
    //                    > uint48 max
    uint256 expectedExcess = parentExcessMana + parentManaUsed - MANA_TARGET;
    assertTrue(expectedExcess > maxUint48, "computed excessMana should overflow uint48");

    // Warp to slot 1
    vm.warp(block.timestamp + SLOT_DURATION);

    // Fee queries still work (they operate on uint256 internally, no compression)
    uint256 manaMinFee = rollup.getManaMinFeeAt(Timestamp.wrap(block.timestamp), true);

    (ProposeArgs memory proposeArgs, CommitteeAttestations memory attestations, address[] memory signers) =
      _buildProposal(rollup, manaMinFee);

    skipBlobCheck(address(rollup));

    // propose succeeds because compress() caps excessMana at uint48 max instead of reverting.
    rollup.propose(proposeArgs, attestations, signers, Signature({v: 0, r: 0, s: 0}), full.checkpoint.blobCommitments);

    // Verify the stored fee header has capped excessMana
    FeeHeader memory storedFeeHeader = rollup.getFeeHeader(1);
    assertEq(storedFeeHeader.excessMana, type(uint48).max, "stored excessMana should be capped at 48-bit max");
  }
}
