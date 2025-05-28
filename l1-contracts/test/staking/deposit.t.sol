// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IStakingCore, Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {IGSE, IGSECore} from "@aztec/core/staking/GSE.sol";

contract DepositTest is StakingBase {
  function test_GivenCallerHasInsufficientAllowance() external {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector, address(staking), 0, MINIMUM_STAKE
      )
    );

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });
  }

  modifier givenCallerHasSufficientAllowance() {
    stakingAsset.approve(address(staking), MINIMUM_STAKE);
    _;
  }

  function test_GivenCallerHasInsufficientFunds() external givenCallerHasSufficientAllowance {
    // it reverts

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector, address(this), 0, MINIMUM_STAKE
      )
    );

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });
  }

  modifier givenCallerHasSufficientFunds() {
    stakingAsset.mint(address(this), MINIMUM_STAKE);
    _;
  }

  function test_GivenAttesterIsAlreadyRegistered()
    external
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
  {
    // it reverts

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });

    stakingAsset.mint(address(this), MINIMUM_STAKE);
    stakingAsset.approve(address(staking), type(uint256).max);

    address magicAddress = address(staking.getGSE().CANONICAL_MAGIC_ADDRESS());

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__AlreadyRegistered.selector, magicAddress, ATTESTER)
    );
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });

    vm.prank(SLASHER);
    staking.slash(ATTESTER, MINIMUM_STAKE / 2);
    assertEq(uint256(staking.getStatus(ATTESTER)), uint256(Status.LIVING));

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, ATTESTER));
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, WITHDRAWER);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, ATTESTER));
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });
  }

  modifier givenAttesterIsNotRegistered() {
    _;
  }

  function test_GivenAttesterIsAlreadyActive()
    external
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
    givenAttesterIsNotRegistered
  {
    // it reverts

    // This should not be possible to get to as the attester is registered until exit
    // and to exit it must already have been removed from the active set.
  }

  function test_GivenAttesterIsNotActive()
    external
    givenCallerHasSufficientAllowance
    givenCallerHasSufficientFunds
    givenAttesterIsNotRegistered
  {
    // it transfer funds from the caller
    // it adds attester to the set
    // it updates the operator info
    // it emits a {Deposit} event

    assertEq(stakingAsset.balanceOf(address(staking)), 0);

    vm.expectEmit(true, true, true, true, address(staking.getGSE()));
    emit IGSECore.Deposit(
      address(staking.getGSE().CANONICAL_MAGIC_ADDRESS()), ATTESTER, PROPOSER, WITHDRAWER
    );

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });

    assertEq(stakingAsset.balanceOf(address(staking.getGSE().getGovernance())), MINIMUM_STAKE);

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, MINIMUM_STAKE, "effective balance");
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.config.proposer, PROPOSER);
    assertTrue(attesterView.status == Status.VALIDATING);
  }
}
