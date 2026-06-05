// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStakingCore, IStaking, Timestamp} from "@aztec/core/interfaces/IStaking.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/// @notice Covers the legacy-slasher drain window introduced to keep already-quorumed slashing
///         rounds executable across a slasher rotation. The window must:
///           - install on finalize and emit `LegacySlasherAuthorized`,
///           - accept slash calls from the outgoing slasher while open,
///           - reject them once the window has elapsed.
contract SlashLegacyTest is StakingBase {
  /// @dev StakingBase deploys with slasher disabled (default config). Override to enable
  ///      slashing so the rollup actually has a non-zero active slasher to rotate off.
  function setUp() public override {
    // SlashingProposer requires `slashingRoundSize % epochDuration == 0` and quorum > roundSize/2.
    // Default epoch duration is 32, so round 32 and quorum 17 satisfy both constraints.
    RollupBuilder builder =
      new RollupBuilder(address(this)).setSlashingQuorum(17).setSlashingRoundSize(32).setSlasherEnabled(true);
    builder.deploy();

    registry = builder.getConfig().registry;
    RollupConfigInput memory rollupConfig = builder.getConfig().rollupConfigInput;
    EPOCH_DURATION_SECONDS = rollupConfig.aztecEpochDuration * rollupConfig.aztecSlotDuration;

    staking = IStaking(address(builder.getConfig().rollup));
    stakingAsset = builder.getConfig().testERC20;

    ACTIVATION_THRESHOLD = staking.getActivationThreshold();
    EJECTION_THRESHOLD = staking.getEjectionThreshold();
    SLASHER = staking.getSlasher();
    require(SLASHER != address(0), "slasher must be enabled for these tests");
  }
  address internal constant NEW_SLASHER = address(uint160(uint256(keccak256("new-slasher"))));

  function _owner() internal view returns (address) {
    return Ownable(address(staking)).owner();
  }

  function _depositActive() internal {
    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();
  }

  function _finalizeNewSlasher() internal {
    address owner = _owner();
    uint256 delay = staking.getSlasherExecutionDelay();

    // Mock NEW_SLASHER so it satisfies both queueSetSlasher's and finalize's PROPOSER check.
    vm.mockCall(NEW_SLASHER, abi.encodeWithSignature("PROPOSER()"), abi.encode(address(0xBEEF)));

    vm.prank(owner);
    staking.queueSetSlasher(NEW_SLASHER);
    vm.warp(block.timestamp + delay);
    staking.finalizeSetSlasher();
  }

  function test_finalize_emitsLegacySlasherAuthorizedAndPopulatesGetter() external {
    address oldSlasher = staking.getSlasher();
    address owner = _owner();
    uint256 delay = staking.getSlasherExecutionDelay();
    uint256 window = staking.getLegacySlasherDrainWindow();

    vm.mockCall(NEW_SLASHER, abi.encodeWithSignature("PROPOSER()"), abi.encode(address(0xBEEF)));
    vm.prank(owner);
    staking.queueSetSlasher(NEW_SLASHER);
    vm.warp(block.timestamp + delay);

    uint256 expectedUntil = block.timestamp + window;
    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.LegacySlasherAuthorized(oldSlasher, expectedUntil);
    staking.finalizeSetSlasher();

    assertEq(staking.getSlasher(), NEW_SLASHER, "active slasher rotated");
    (address legacy, Timestamp authorizedUntil) = staking.getLegacySlasher();
    assertEq(legacy, oldSlasher, "legacy slot must hold the outgoing slasher");
    assertEq(Timestamp.unwrap(authorizedUntil), expectedUntil, "legacy authorizedUntil mismatch");
  }

  function test_legacySlasher_canStillSlashInsideWindow() external {
    address oldSlasher = staking.getSlasher();
    _depositActive();

    _finalizeNewSlasher();

    // Still inside the drain window: the old slasher must continue to be authorized so an
    // already-quorumed slashing round can settle even though the active slasher moved.
    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, 1);
    vm.prank(oldSlasher);
    staking.slash(ATTESTER, 1);
  }

  function test_legacySlasher_revertsAfterWindow() external {
    address oldSlasher = staking.getSlasher();
    _depositActive();

    _finalizeNewSlasher();

    (, Timestamp authorizedUntil) = staking.getLegacySlasher();
    vm.warp(Timestamp.unwrap(authorizedUntil) + 1);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotSlasher.selector, NEW_SLASHER, oldSlasher));
    vm.prank(oldSlasher);
    staking.slash(ATTESTER, 1);
  }

  function test_legacySlasher_atWindowBoundaryStillAuthorized() external {
    address oldSlasher = staking.getSlasher();
    _depositActive();

    _finalizeNewSlasher();

    (, Timestamp authorizedUntil) = staking.getLegacySlasher();
    vm.warp(Timestamp.unwrap(authorizedUntil));

    // Inclusive boundary: equality must still authorize.
    vm.prank(oldSlasher);
    staking.slash(ATTESTER, 1);
  }

  function test_activeSlasher_canSlashEvenWhileLegacyOpen() external {
    _depositActive();
    _finalizeNewSlasher();

    // The new (active) slasher's path stays unaffected by the legacy slot.
    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, 1);
    vm.prank(NEW_SLASHER);
    staking.slash(ATTESTER, 1);
  }
}
