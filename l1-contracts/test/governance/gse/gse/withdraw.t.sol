// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Withdrawal} from "@aztec/governance/interfaces/IGovernance.sol";

contract WithdrawTest is WithGSE {
  address internal caller;
  bool internal onCanonical = false;

  address internal WITHDRAWER = address(0x1234);
  address internal MAGIC_ADDRESS;
  uint256 internal amount;

  function setUp() public override {
    super.setUp();
    MAGIC_ADDRESS = gse.CANONICAL_MAGIC_ADDRESS();
  }

  function test_WhenCallerIsNotRegisteredRollup(address _instance) external {
    // it reverts

    vm.assume(!gse.isRollupRegistered(_instance));

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotRollup.selector, _instance));
    gse.withdraw(address(0), 0);
  }

  modifier whenCallerIsRegisteredRollup(address _instance) {
    vm.assume(_instance != address(0) && _instance != MAGIC_ADDRESS);
    vm.assume(gse.isRollupRegistered(_instance) == false);

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  modifier givenAttesterNotFoundInCallerInstance(address _instance, address _attester) {
    vm.assume(_attester != address(0));
    vm.assume(!gse.isRegistered(_instance, _attester));

    _;
  }

  function test_GivenCallerIsNotCanonical(address _instance, address _instance2, address _attester)
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterNotFoundInCallerInstance(_instance, _attester)
  {
    // it reverts
    vm.assume(_instance != _instance2 && _instance2 != address(0) && _instance2 != MAGIC_ADDRESS);

    cheat_deposit(_instance, _attester, WITHDRAWER, true);

    vm.prank(gse.owner());
    gse.addRollup(_instance2);

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(_instance2, _attester), false);
    assertEq(gse.isRegistered(MAGIC_ADDRESS, _attester), true);

    // While it was added when we were canonical, it moved away, so we cannot get it now.

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NothingToExit.selector, _attester));
    gse.withdraw(_attester, 0);
  }

  modifier givenCallerIsCanonical() {
    _;
  }

  function test_GivenAttesterNotFoundInCanonical(address _instance, address _attester)
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterNotFoundInCallerInstance(_instance, _attester)
    givenCallerIsCanonical
  {
    // it reverts

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(MAGIC_ADDRESS, _attester), false);

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NothingToExit.selector, _attester));
    gse.withdraw(_attester, 0);
  }

  modifier givenAttesterFoundInCanonical(address _instance, address _attester) {
    vm.assume(_attester != address(0));

    if (!gse.isRegistered(_instance, _attester)) {
      cheat_deposit(_instance, _attester, WITHDRAWER, true);
    }

    _;
  }

  function test_GivenBalanceLessThanAmount(address _instance, address _attester, uint256 _amount)
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterNotFoundInCallerInstance(_instance, _attester)
    givenCallerIsCanonical
    givenAttesterFoundInCanonical(_instance, _attester)
  {
    // it reverts

    uint256 balance = gse.balanceOf(MAGIC_ADDRESS, _attester);
    amount = bound(_amount, balance + 1, type(uint256).max);

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__InsufficientStake.selector, balance, amount));
    gse.withdraw(_attester, amount);
  }

  modifier givenBalanceGreaterOrEqualToAmount(address _attester, uint256 _amount) {
    uint256 balance = gse.balanceOf(MAGIC_ADDRESS, _attester);
    amount = bound(_amount, 0, balance);
    _;
  }

  function test_GivenBalanceMinusAmountLessThanMinimumStake(
    address _instance,
    address _attester,
    uint256 _amount
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterNotFoundInCallerInstance(_instance, _attester)
    givenCallerIsCanonical
    givenAttesterFoundInCanonical(_instance, _attester)
    givenBalanceGreaterOrEqualToAmount(_attester, _amount)
  {
    // it removes attester from canonical instance
    // it deletes attester config
    // it delegates attester to address zero
    // it withdraws full balance
    // it decreases delegation balance by full amount
    // it initiates withdrawal in governance
    // it returns full balance, true, withdrawal id
    uint256 balance = gse.balanceOf(MAGIC_ADDRESS, _attester);
    {
      assertEq(gse.isRegistered(MAGIC_ADDRESS, _attester), true);
      assertEq(gse.getDelegatee(MAGIC_ADDRESS, _attester), MAGIC_ADDRESS);
      assertEq(gse.getConfig(MAGIC_ADDRESS, _attester).withdrawer, WITHDRAWER);

      amount = bound(_amount, balance - gse.MINIMUM_STAKE() + 1, balance);
    }

    // He will be removed entirely
    {
      vm.prank(_instance);
      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) =
        gse.withdraw(_attester, amount);
      assertEq(amountWithdrawn, balance);
      assertEq(isRemoved, true);
      assertEq(withdrawalId, 0);
    }
    {
      Withdrawal memory withdrawal = governance.getWithdrawal(0);
      assertEq(withdrawal.amount, balance);
      assertEq(withdrawal.recipient, _instance);
      assertEq(withdrawal.claimed, false);
    }
    {
      assertEq(gse.isRegistered(MAGIC_ADDRESS, _attester), false);
      assertEq(gse.getDelegatee(MAGIC_ADDRESS, _attester), address(0));
      assertEq(gse.getConfig(MAGIC_ADDRESS, _attester).withdrawer, address(0));
      assertEq(gse.balanceOf(MAGIC_ADDRESS, _attester), 0);
    }
  }

  function test_GivenBalanceMinusAmountGreaterOrEqualToMinimumStake(
    address _instance,
    address _attester,
    uint256 _amount
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterNotFoundInCallerInstance(_instance, _attester)
    givenCallerIsCanonical
    givenAttesterFoundInCanonical(_instance, _attester)
    givenBalanceGreaterOrEqualToAmount(_attester, _amount)
  {
    // it withdraws specified amount
    // it decreases delegation balance by specified amount
    // it initiates withdrawal in governance
    // it returns specified amount, false, withdrawal id

    uint256 balance = gse.balanceOf(MAGIC_ADDRESS, _attester);
    {
      assertEq(gse.isRegistered(MAGIC_ADDRESS, _attester), true);
      assertEq(gse.getDelegatee(MAGIC_ADDRESS, _attester), MAGIC_ADDRESS);
      assertEq(gse.getConfig(MAGIC_ADDRESS, _attester).withdrawer, WITHDRAWER);

      amount = bound(_amount, 0, balance - gse.MINIMUM_STAKE());
    }

    // He will not be removed
    {
      vm.prank(_instance);
      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) =
        gse.withdraw(_attester, amount);
      assertEq(amountWithdrawn, amount);
      assertEq(isRemoved, false);
      assertEq(withdrawalId, 0);
    }
    {
      Withdrawal memory withdrawal = governance.getWithdrawal(0);
      assertEq(withdrawal.amount, amount);
      assertEq(withdrawal.recipient, _instance);
      assertEq(withdrawal.claimed, false);
    }
    {
      assertEq(gse.isRegistered(MAGIC_ADDRESS, _attester), true);
      assertEq(gse.getDelegatee(MAGIC_ADDRESS, _attester), MAGIC_ADDRESS);
      assertEq(gse.getConfig(MAGIC_ADDRESS, _attester).withdrawer, WITHDRAWER);
      assertEq(gse.balanceOf(MAGIC_ADDRESS, _attester), balance - amount);
    }
  }

  modifier givenAttesterFoundInCallerInstance(address _instance, address _attester) {
    vm.assume(_attester != address(0));

    if (!gse.isRegistered(_instance, _attester)) {
      cheat_deposit(_instance, _attester, WITHDRAWER, false);
    }

    _;
  }

  function test_GivenBalanceLessThanAmount2(address _instance, address _attester, uint256 _amount)
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterFoundInCallerInstance(_instance, _attester)
  {
    // it reverts

    uint256 balance = gse.balanceOf(_instance, _attester);
    amount = bound(_amount, balance + 1, type(uint256).max);

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__InsufficientStake.selector, balance, amount));
    gse.withdraw(_attester, amount);
  }

  modifier givenBalanceGreaterOrEqualToAmount2(
    address _instance,
    address _attester,
    uint256 _amount
  ) {
    uint256 balance = gse.balanceOf(_instance, _attester);
    amount = bound(_amount, 0, balance);

    _;
  }

  function test_GivenBalanceMinusAmountLessThanMinimumStake2(
    address _instance,
    address _attester,
    uint256 _amount
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterFoundInCallerInstance(_instance, _attester)
    givenBalanceGreaterOrEqualToAmount2(_instance, _attester, _amount)
  {
    // it removes attester from caller instance
    // it deletes attester config
    // it delegates attester to address zero
    // it withdraws full balance
    // it decreases delegation balance by full amount
    // it initiates withdrawal in governance
    // it returns full balance, true, withdrawal id

    uint256 balance = gse.balanceOf(_instance, _attester);
    {
      assertEq(gse.isRegistered(_instance, _attester), true);
      assertEq(gse.getDelegatee(_instance, _attester), _instance);
      assertEq(gse.getConfig(_instance, _attester).withdrawer, WITHDRAWER);

      amount = bound(_amount, balance - gse.MINIMUM_STAKE() + 1, balance);
    }

    // He will be removed entirely
    {
      vm.prank(_instance);
      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) =
        gse.withdraw(_attester, amount);
      assertEq(amountWithdrawn, balance);
      assertEq(isRemoved, true);
      assertEq(withdrawalId, 0);
    }
    {
      Withdrawal memory withdrawal = governance.getWithdrawal(0);
      assertEq(withdrawal.amount, balance);
      assertEq(withdrawal.recipient, _instance);
      assertEq(withdrawal.claimed, false);
    }
    {
      assertEq(gse.isRegistered(_instance, _attester), false);
      assertEq(gse.getDelegatee(_instance, _attester), address(0));
      assertEq(gse.getConfig(_instance, _attester).withdrawer, address(0));
      assertEq(gse.balanceOf(_instance, _attester), 0);
    }
  }

  function test_GivenBalanceMinusAmountGreaterOrEqualToMinimumStake2(
    address _instance,
    address _attester,
    uint256 _amount
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    givenAttesterFoundInCallerInstance(_instance, _attester)
    givenBalanceGreaterOrEqualToAmount2(_instance, _attester, _amount)
  {
    // it withdraws specified amount
    // it decreases delegation balance by specified amount
    // it initiates withdrawal in governance
    // it returns specified amount, false, withdrawal id

    uint256 balance = gse.balanceOf(_instance, _attester);
    {
      assertEq(gse.isRegistered(_instance, _attester), true);
      assertEq(gse.getDelegatee(_instance, _attester), _instance);
      assertEq(gse.getConfig(_instance, _attester).withdrawer, WITHDRAWER);

      amount = bound(_amount, 0, balance - gse.MINIMUM_STAKE());
    }

    // He will not be removed
    {
      vm.prank(_instance);
      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) =
        gse.withdraw(_attester, amount);
      assertEq(amountWithdrawn, amount);
      assertEq(isRemoved, false);
      assertEq(withdrawalId, 0);
    }
    {
      Withdrawal memory withdrawal = governance.getWithdrawal(0);
      assertEq(withdrawal.amount, amount);
      assertEq(withdrawal.recipient, _instance);
      assertEq(withdrawal.claimed, false);
    }
    {
      assertEq(gse.isRegistered(_instance, _attester), true);
      assertEq(gse.getDelegatee(_instance, _attester), _instance);
      assertEq(gse.getConfig(_instance, _attester).withdrawer, WITHDRAWER);
      assertEq(gse.balanceOf(_instance, _attester), balance - amount);
    }
  }
}
