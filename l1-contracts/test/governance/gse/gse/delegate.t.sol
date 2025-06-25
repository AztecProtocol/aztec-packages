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
    address _attester2,
    address _delegatee,
    address _withdrawer
  ) external givenInstanceIsRegistered(_instance) {
    // it reverts

    vm.assume(_withdrawer != _attester);
    vm.assume(_withdrawer != _attester2);
    vm.assume(_attester != address(0));
    vm.assume(_attester != _attester2);
    vm.assume(_delegatee != address(0));
    vm.assume(_attester2 != address(0));

    cheat_deposit(_instance, _attester, _withdrawer, false);
    cheat_deposit(_instance, _attester2, _withdrawer, true);

    // Checks on the specific instance
    {
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

    // Checks on the canonical address
    {
      vm.prank(_attester2);
      vm.expectRevert(
        abi.encodeWithSelector(Errors.GSE__NotWithdrawer.selector, address(0), _attester2)
      );
      gse.delegate(_instance, _attester2, _delegatee);

      address magic = gse.getCanonicalMagicAddress();

      vm.prank(_attester2);
      vm.expectRevert(
        abi.encodeWithSelector(Errors.GSE__NotWithdrawer.selector, _withdrawer, _attester2)
      );
      gse.delegate(magic, _attester2, _delegatee);
    }
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

    cheat_deposit(_instance, _attester, _withdrawer, _isCanonical);

    address addr = _isCanonical ? gse.getCanonicalMagicAddress() : _instance;

    vm.prank(_withdrawer);
    gse.delegate(addr, _attester, _delegatee);

    // Lookup the delegatee
    assertEq(gse.getDelegatee(addr, _attester), _delegatee);
    assertEq(gse.getVotingPower(_delegatee), gse.DEPOSIT_AMOUNT());
  }
}
