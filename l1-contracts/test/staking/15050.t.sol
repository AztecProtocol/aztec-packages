// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStaking, IStakingCore, Status, AttesterView, Exit, Timestamp} from "@aztec/core/interfaces/IStaking.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

import {SlashPayload, IPayload} from "@aztec/periphery/SlashPayload.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract Test15050 is StakingBase {
  function setUp() public override {
    // This test needs slashing enabled to test slash execution
    RollupBuilder builder = new RollupBuilder(address(this)).setSlasherEnabled(true);
    builder.deploy();

    registry = builder.getConfig().registry;
    RollupConfigInput memory rollupConfig = builder.getConfig().rollupConfigInput;
    EPOCH_DURATION_SECONDS = rollupConfig.aztecEpochDuration * rollupConfig.aztecSlotDuration;
    staking = IStaking(address(builder.getConfig().rollup));
    stakingAsset = builder.getConfig().testERC20;
    ACTIVATION_THRESHOLD = staking.getActivationThreshold();
    EJECTION_THRESHOLD = staking.getEjectionThreshold();
    SLASHER = staking.getSlasher();
  }

  function test_15050() external {
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(this), ACTIVATION_THRESHOLD);
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

    address[] memory validators = new address[](1);
    validators[0] = ATTESTER;
    uint96[] memory amounts = new uint96[](1);
    amounts[0] = uint96(ACTIVATION_THRESHOLD);

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    assertEq(attesterView.effectiveBalance, ACTIVATION_THRESHOLD);
    assertEq(attesterView.exit.amount, 0);
    assertEq(attesterView.exit.exitableAt, 0);
    assertEq(attesterView.exit.isRecipient, false);

    SlashPayload payload = new SlashPayload(validators, amounts, IValidatorSelection(address(staking)));

    // Directly slash through the slasher by pranking as the proposer
    vm.prank(Slasher(SLASHER).PROPOSER());
    Slasher(SLASHER).slash(IPayload(address(payload)));

    attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.NONE, "attester status");
    assertEq(attesterView.effectiveBalance, 0, "attester effective balance");
    assertEq(attesterView.exit.amount, 0, "attester exit amount");
    assertEq(attesterView.exit.exitableAt, 0, "attester exit exitableAt");
    assertEq(attesterView.exit.isRecipient, false, "attester exit isRecipient");
  }
}
