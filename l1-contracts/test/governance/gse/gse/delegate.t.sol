// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract DelegateTest is WithGSE {
  function test_GivenInstanceIsNotRegistered(
    address _instance,
    address _attester,
    address _delegatee
  ) external {
    // it reverts

    vm.assume(gse.isRollupRegistered(_instance) == false);

    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__InstanceDoesNotExist.selector, _instance));
    gse.delegate(_instance, _attester, _delegatee);
  }

  modifier givenInstanceIsRegistered(address _instance) {
    vm.assume(_instance != address(0) && _instance != gse.getCanonicalMagicAddress());

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  function test_GivenCallerIsNotWithdrawer(
    address _instance,
    address _attester,
    address _delegatee,
    address _withdrawer
  ) external givenInstanceIsRegistered(_instance) {
    // it reverts

    vm.assume(_withdrawer != _attester);
    vm.assume(_attester != address(0));
    vm.assume(_delegatee != address(0));

    TestERC20 testERC20 = TestERC20(address(gse.STAKING_ASSET()));
    uint256 depositAmount = gse.DEPOSIT_AMOUNT();
    vm.prank(gse.owner());
    testERC20.mint(address(_instance), depositAmount);

    vm.prank(_instance);
    testERC20.approve(address(gse), depositAmount);

    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, false);

    vm.prank(_attester);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GSE__NotWithdrawer.selector, _withdrawer, _attester)
    );
    gse.delegate(_instance, _attester, _delegatee);

    address magic = gse.getCanonicalMagicAddress();

    vm.prank(_attester);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GSE__NotWithdrawer.selector, address(0), _attester)
    );
    gse.delegate(magic, _attester, _delegatee);
  }

  function test_GivenCallerIsWithdrawer(
    address _instance,
    address _attester,
    address _delegatee,
    address _withdrawer,
    bool _isCanonical
  ) external givenInstanceIsRegistered(_instance) {
    // it delegates voting power

    vm.assume(_withdrawer != _attester);
    vm.assume(_attester != address(0));
    vm.assume(_delegatee != address(0));

    TestERC20 testERC20 = TestERC20(address(gse.STAKING_ASSET()));
    uint256 depositAmount = gse.DEPOSIT_AMOUNT();
    vm.prank(gse.owner());
    testERC20.mint(address(_instance), depositAmount);

    vm.prank(_instance);
    testERC20.approve(address(gse), depositAmount);

    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, _isCanonical);

    address addr = _isCanonical ? gse.getCanonicalMagicAddress() : _instance;

    vm.prank(_withdrawer);
    gse.delegate(addr, _attester, _delegatee);

    // Lookup the delegatee
    assertEq(gse.getDelegatee(addr, _attester), _delegatee);
  }
}
