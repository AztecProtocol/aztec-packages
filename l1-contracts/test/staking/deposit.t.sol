// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Staking, IStaking, Status, ValidatorInfo} from "@aztec/core/staking/Staking.sol";

contract DepositTest is StakingBase {
  uint256 internal depositAmount;

  function test_WhenAmountLtMinimumStake() external {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__InsufficientStake.selector, depositAmount, MINIMUM_STAKE
      )
    );

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: depositAmount
    });
  }

  modifier whenAmountGtMinimumStake(uint256 _depositAmount) {
    depositAmount = bound(_depositAmount, MINIMUM_STAKE, type(uint96).max);
    _;
  }

  function test_GivenCallerHasInsufficientAllowance(uint256 _depositAmount)
    external
    whenAmountGtMinimumStake(_depositAmount)
  {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector, address(staking), 0, depositAmount
      )
    );

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: depositAmount
    });
  }

  modifier givenCallerHasSufficientAllowance() {
    stakingAsset.approve(address(staking), depositAmount);
    _;
  }

  function test_GivenCallerHasInsufficientFunds(uint256 _depositAmount)
    external
    whenAmountGtMinimumStake(_depositAmount)
    givenCallerHasSufficientAllowance
  {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, depositAmount
      )
    );

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: depositAmount
    });
  }

  modifier givenCallerHasSufficientFunds() {
    stakingAsset.mint(address(this), depositAmount);
    _;
  }

  function test_GivenAttesterIsAlreadyRegistered(uint256 _depositAmount)
    external
    whenAmountGtMinimumStake(_depositAmount)
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
  {
    // it reverts

    // Show that everything else than the none status is rejected
    for (uint256 i = 1; i < 4; i++) {
      staking.cheat__SetStatus(ATTESTER, Status(i));

      // Try to register the attester again
      vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyRegistered.selector, ATTESTER));
      staking.deposit({
        _attester: ATTESTER,
        _proposer: PROPOSER,
        _withdrawer: WITHDRAWER,
        _amount: depositAmount
      });
    }
  }

  modifier givenAttesterIsNotRegistered() {
    _;
  }

  function test_GivenAttesterIsAlreadyActive(uint256 _depositAmount)
    external
    whenAmountGtMinimumStake(_depositAmount)
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
    givenAttesterIsNotRegistered
  {
    // it reverts

    // This should not be possible to get to as the attester is registered until exit
    // and to exit it must already have been removed from the active set.

    staking.cheat__AddAttester(ATTESTER);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyActive.selector, ATTESTER));
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: depositAmount
    });
  }

  function test_GivenAttesterIsNotActive(uint256 _depositAmount)
    external
    whenAmountGtMinimumStake(_depositAmount)
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
    givenAttesterIsNotRegistered
  {
    // it transfer funds from the caller
    // it adds attester to the set
    // it updates the operator info
    // it emits a {Deposit} event

    assertEq(stakingAsset.balanceOf(address(staking)), 0);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStaking.Deposit(ATTESTER, PROPOSER, WITHDRAWER, depositAmount);

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: depositAmount
    });

    assertEq(stakingAsset.balanceOf(address(staking)), depositAmount);

    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    assertEq(info.stake, depositAmount);
    assertEq(info.withdrawer, WITHDRAWER);
    assertEq(info.proposer, PROPOSER);
    assertTrue(info.status == Status.VALIDATING);
  }
}
