// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Rollup, RollupBuilder, Config} from "@test/builder/RollupBuilder.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatch, Hatch, Status, CandidateInfo} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {FakeRollup} from "./mocks/FakeRollup.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/// @notice Configuration struct for EscapeHatch deployment
/// @dev Foundry can fuzz this struct directly when passed as a test parameter
struct EscapeHatchConfig {
  uint96 bondSize;
  uint96 withdrawalTax;
  uint96 failedHatchPunishment;
  uint256 frequency;
  uint256 activeDuration;
  uint256 lagInHatches;
  uint256 proposingExitDelay;
}

contract EscapeHatchBase is TestBase {
  Rollup internal rollup;
  FakeRollup internal fakeRollup;
  TestERC20 internal bondToken;
  EscapeHatch internal escapeHatch;

  // When true, use fakeRollup instead of real rollup
  bool internal useFakeRollup;

  /**
   * @notice Set random prevrandao in constructor to ensure varied candidate selection
   * @dev Without this, all tests would use prevrandao=0 which could mask bugs in selection logic
   */
  constructor() {
    vm.prevrandao(vm.randomUint());
  }

  // Default configuration values
  uint96 internal constant DEFAULT_BOND_SIZE = 100e18;
  uint96 internal constant DEFAULT_WITHDRAWAL_TAX = 1e18;
  uint96 internal constant DEFAULT_FAILED_HATCH_PUNISHMENT = 10e18;
  uint256 internal constant DEFAULT_FREQUENCY = 35;
  uint256 internal constant DEFAULT_ACTIVE_DURATION = 2;
  uint256 internal constant DEFAULT_LAG_IN_HATCHES = 1;
  uint256 internal constant DEFAULT_PROPOSING_EXIT_DELAY = 0;

  // Configuration - populated by setUp with defaults, or by givenValidConfig with fuzzed values
  EscapeHatchConfig internal config;

  // Test addresses
  address internal CANDIDATE1 = makeAddr("CANDIDATE1");
  address internal CANDIDATE2 = makeAddr("CANDIDATE2");
  address internal CANDIDATE3 = makeAddr("CANDIDATE3");

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;

  function setUp() public virtual {
    // Deploy rollup with simple config
    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1)
      .setEpochDuration(4).setSlotDuration(12);
    builder.deploy();

    Config memory rollupConfig = builder.getConfig();
    rollup = rollupConfig.rollup;
    bondToken = rollupConfig.testERC20;

    SLOT_DURATION = rollupConfig.rollupConfigInput.aztecSlotDuration;
    EPOCH_DURATION = rollupConfig.rollupConfigInput.aztecEpochDuration * SLOT_DURATION;

    // Initialize config with defaults (overwritten by givenValidConfig modifier if used)
    config = EscapeHatchConfig({
      bondSize: DEFAULT_BOND_SIZE,
      withdrawalTax: DEFAULT_WITHDRAWAL_TAX,
      failedHatchPunishment: DEFAULT_FAILED_HATCH_PUNISHMENT,
      frequency: DEFAULT_FREQUENCY,
      activeDuration: DEFAULT_ACTIVE_DURATION,
      lagInHatches: DEFAULT_LAG_IN_HATCHES,
      proposingExitDelay: DEFAULT_PROPOSING_EXIT_DELAY
    });

    // Deploy escape hatch with default config
    escapeHatch = new EscapeHatch(
      address(rollup),
      address(bondToken),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      DEFAULT_ACTIVE_DURATION,
      DEFAULT_LAG_IN_HATCHES,
      DEFAULT_PROPOSING_EXIT_DELAY
    );

    // Register escape hatch with the rollup so selectCandidates deactivation guard passes
    vm.prank(Ownable(address(rollup)).owner());
    rollup.updateEscapeHatch(address(escapeHatch));

    vm.label(address(rollup), "Rollup");
    vm.label(address(bondToken), "BondToken");
    vm.label(address(escapeHatch), "EscapeHatch");
    vm.label(CANDIDATE1, "Candidate1");
    vm.label(CANDIDATE2, "Candidate2");
    vm.label(CANDIDATE3, "Candidate3");
  }

  // ============ Helper Functions ============

  /// @notice Returns the current rollup address (real or fake)
  function _getRollup() internal view returns (address) {
    return useFakeRollup ? address(fakeRollup) : address(rollup);
  }

  /// @notice Deploys a FakeRollup and new EscapeHatch using it
  /// @dev Call this in tests that need to control rollup state (provenCheckpointNumber, archiveAt)
  function _deployWithFakeRollup() internal {
    useFakeRollup = true;
    fakeRollup = new FakeRollup();
    vm.label(address(fakeRollup), "FakeRollup");

    escapeHatch = new EscapeHatch(
      address(fakeRollup),
      address(bondToken),
      config.bondSize,
      config.withdrawalTax,
      config.failedHatchPunishment,
      config.frequency,
      config.activeDuration,
      config.lagInHatches,
      config.proposingExitDelay
    );
    vm.label(address(escapeHatch), "EscapeHatchWithFakeRollup");

    // Register escape hatch with the fake rollup so selectCandidates deactivation guard passes
    fakeRollup.setEscapeHatch(address(escapeHatch));
  }

  function _mintAndApprove(address _candidate, uint256 _amount) internal {
    vm.prank(bondToken.owner());
    bondToken.mint(_candidate, _amount);
    vm.prank(_candidate);
    bondToken.approve(address(escapeHatch), _amount);
  }

  function _joinCandidateSet(address _candidate) internal {
    _mintAndApprove(_candidate, DEFAULT_BOND_SIZE);
    vm.prank(_candidate);
    escapeHatch.joinCandidateSet();
  }

  function _warpToEpoch(uint256 _epochNumber) internal {
    Timestamp ts = IValidatorSelection(_getRollup()).getTimestampForEpoch(Epoch.wrap(_epochNumber));
    vm.warp(Timestamp.unwrap(ts));
  }

  function _warpForwardEpochs(uint256 _numEpochs) internal {
    // Use proper epoch calculation from current rollup (handles both real and fake rollup)
    Epoch currentEpoch = _getCurrentEpoch();
    Epoch targetEpoch = Epoch.wrap(Epoch.unwrap(currentEpoch) + _numEpochs);
    _warpToEpoch(Epoch.unwrap(targetEpoch));
  }

  function _getHatchForEpoch(uint256 _epochNumber) internal view returns (Hatch) {
    return escapeHatch.getHatch(Epoch.wrap(_epochNumber));
  }

  function _getFirstEpochOfHatch(Hatch _hatch) internal view returns (Epoch) {
    return escapeHatch.getFirstEpoch(_hatch);
  }

  function _getCurrentEpoch() internal view returns (Epoch) {
    return IValidatorSelection(_getRollup()).getCurrentEpoch();
  }

  /// @notice Ensures we're at a safe epoch where joinCandidateSet won't revert with HatchTooEarly
  /// @dev Only warps forward if needed - never goes backward in time.
  ///      Must be at an epoch where getSetTimestamp() won't revert.
  ///      This happens when currentHatch >= lagInHatches and the freeze epoch is valid.
  function _warpToSafeEpoch() internal {
    uint256 safeEpoch = (config.lagInHatches) * config.frequency;
    if (Epoch.unwrap(_getCurrentEpoch()) < safeEpoch) {
      _warpToEpoch(safeEpoch);
    }
  }

  // ============ Fuzz Config Helpers ============

  /// @notice Bounds a fuzzed config to valid values
  /// @dev Valid constraints:
  ///      - activeDuration >= 2
  ///      - frequency > activeDuration
  ///      - frequency > LAG_IN_EPOCHS_FOR_SET_SIZE (2) for valid selection window
  ///      - frequency >= 6 to allow reasonable selection window after warping
  ///        (tests warp to epoch frequency+3, need frequency+3 < 2*frequency-2)
  ///      - failedHatchPunishment <= bondSize
  ///      - withdrawalTax <= bondSize
  ///      - bondSize > 0
  ///      - frequency/activeDuration must not overflow uint32 when converted to timestamps
  ///      - proposingExitDelay <= 30 days
  function _boundValidConfig(EscapeHatchConfig memory _config) internal pure returns (EscapeHatchConfig memory) {
    EscapeHatchConfig memory bounded;

    // activeDuration must be >= 2
    // Upper bound ensures timestamps don't overflow uint32 (max ~1000 epochs with typical config)
    bounded.activeDuration = bound(_config.activeDuration, 2, 1000);

    // frequency must be > activeDuration AND > LAG_IN_EPOCHS_FOR_SET_SIZE (2)
    // Also needs to be >= 6 to allow tests to warp safely (frequency+3 < 2*frequency-2)
    // minimum = max(activeDuration + 1, 6)
    uint256 minFrequency = bounded.activeDuration + 1 > 6 ? bounded.activeDuration + 1 : 6;
    bounded.frequency = bound(_config.frequency, minFrequency, 10_000);

    // bondSize must be > 0
    bounded.bondSize = uint96(bound(_config.bondSize, 1, type(uint96).max));

    // failedHatchPunishment must be <= bondSize
    bounded.failedHatchPunishment = uint96(bound(_config.failedHatchPunishment, 0, bounded.bondSize));

    // withdrawalTax must be <= bondSize
    bounded.withdrawalTax = uint96(bound(_config.withdrawalTax, 0, bounded.bondSize));

    // lagInHatches must be between 1 and 10
    bounded.lagInHatches = bound(_config.lagInHatches, 1, 10);

    // proposingExitDelay must be <= 30 days
    bounded.proposingExitDelay = bound(_config.proposingExitDelay, 0, 30 days);

    return bounded;
  }

  /// @notice Modifier that bounds a fuzzed config, stores it, and deploys a new EscapeHatch
  /// @dev Use this when you want to test with various valid configurations.
  ///      Automatically warps to safe epoch to avoid HatchTooEarly errors.
  modifier givenValidConfig(EscapeHatchConfig memory _config) {
    config = _boundValidConfig(_config);

    // Deploy new escape hatch with fuzzed config (uses current rollup - real or fake)
    escapeHatch = new EscapeHatch(
      _getRollup(),
      address(bondToken),
      config.bondSize,
      config.withdrawalTax,
      config.failedHatchPunishment,
      config.frequency,
      config.activeDuration,
      config.lagInHatches,
      config.proposingExitDelay
    );

    vm.label(address(escapeHatch), "FuzzedEscapeHatch");

    // Register the new escape hatch so selectCandidates deactivation guard passes
    if (useFakeRollup) {
      fakeRollup.setEscapeHatch(address(escapeHatch));
    } else {
      vm.prank(Ownable(address(rollup)).owner());
      rollup.updateEscapeHatch(address(escapeHatch));
    }

    // Warp to safe epoch to avoid HatchTooEarly errors
    _warpToSafeEpoch();
    _;
  }

  /// @notice Helper to join candidate set using current config's bond size
  function _joinCandidateSetWithConfig(address _candidate) internal {
    _mintAndApprove(_candidate, config.bondSize);
    vm.prank(_candidate);
    escapeHatch.joinCandidateSet();
  }
}
