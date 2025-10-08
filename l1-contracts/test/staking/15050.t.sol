// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStakingCore, Status, AttesterView, Exit, Timestamp} from "@aztec/core/interfaces/IStaking.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";

import {SlashPayload, IPayload} from "@aztec/periphery/SlashPayload.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {EmpireSlashingProposer} from "@aztec/core/slashing/EmpireSlashingProposer.sol";
import {RoundAccounting} from "@aztec/governance/proposer/EmpireBase.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract Test15050 is StakingBase {
  using stdStorage for StdStorage;

  function setUp() public override {
    super.setUp();
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

    EmpireSlashingProposer caller = EmpireSlashingProposer(Slasher(SLASHER).PROPOSER());

    stdstore.clear();
    stdstore.enable_packed_slots().target(address(caller)).sig("getRoundData(address,uint256)").with_key(
      address(staking)
    ).with_key(uint256(0)).depth(1).checked_write(address(payload));

    stdstore.clear();
    stdstore.target(address(caller)).sig("signalCount(address,uint256,address)").with_key(address(staking)).with_key(
      uint256(0)
    ).with_key(address(payload)).checked_write(caller.ROUND_SIZE());

    assertEq(caller.getCurrentRound(), 0);

    while (caller.getCurrentRound() == 0) {
      vm.warp(block.timestamp + 12);
    }

    assertEq(caller.getCurrentRound(), 1);

    RoundAccounting memory r = caller.getRoundData(address(staking), 0);
    assertFalse(r.executed);

    address target = payload.getActions()[0].target;
    bytes memory data = payload.getActions()[0].data;
    bytes memory returnData = ""; // empty because oog won't give anything back.
    vm.expectRevert(abi.encodeWithSelector(Slasher.Slasher__SlashFailed.selector, target, data, returnData));
    // We execute the proposal with some gas amount that is insufficient to execute all
    // the accounting. And then we see that the proposal is marked as executed, so we cannot
    // execute it again, but at the same time, the attester was not actually slashes!
    // It can require a bit of fiddling here to get the correct one going gas-wise.
    caller.submitRoundWinner{gas: 200_000}(0);

    r = caller.getRoundData(address(staking), 0);
    assertFalse(r.executed);

    attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    assertEq(attesterView.effectiveBalance, ACTIVATION_THRESHOLD);
    assertEq(attesterView.exit.amount, 0);
    assertEq(attesterView.exit.exitableAt, 0);
    assertEq(attesterView.exit.isRecipient, false);

    // Because it failed to execute, we can execute it now with more gas

    caller.submitRoundWinner(0);

    r = caller.getRoundData(address(staking), 0);
    assertTrue(r.executed);

    attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.NONE, "attester status");
    assertEq(attesterView.effectiveBalance, 0, "attester effective balance");
    assertEq(attesterView.exit.amount, 0, "attester exit amount");
    assertEq(attesterView.exit.exitableAt, 0, "attester exit exitableAt");
    assertEq(attesterView.exit.isRecipient, false, "attester exit isRecipient");
  }
}
