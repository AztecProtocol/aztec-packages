// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";

contract DepositTest is WithGSE {
  address internal caller;
  bool internal onCanonical = false;

  function test_WhenCallerIsNotRegisteredRollup(address _instance) external {
    // it reverts

    vm.assume(gse.isRollupRegistered(_instance) == false);

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotRollup.selector, _instance));
    gse.deposit(address(0), address(0), onCanonical);
  }

  modifier whenCallerIsRegisteredRollup(address _instance) {
    vm.assume(_instance != address(0) && _instance != gse.CANONICAL_MAGIC_ADDRESS());

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  modifier givenOnCanonicalEqTrue() {
    onCanonical = true;
    _;
  }

  function test_GivenCallerIsNotCanonical(address _instance1, address _instance2)
    external
    whenCallerIsRegisteredRollup(_instance1)
    whenCallerIsRegisteredRollup(_instance2)
    givenOnCanonicalEqTrue
  {
    // it reverts

    vm.prank(_instance1);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotCanonical.selector, _instance1));
    gse.deposit(address(0), address(0), onCanonical);
  }

  modifier givenCallerIsCanonical() {
    _;
  }

  function test_GivenAttesterAlreadyRegisteredOnSpecificInstance(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnCanonicalEqTrue givenCallerIsCanonical {
    // it reverts

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), depositAmount);
    gse.deposit(_attester, _withdrawer, false);
    vm.stopPrank();

    vm.prank(_instance);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, _instance, _attester)
    );
    gse.deposit(_attester, _withdrawer, onCanonical);
  }

  function test_GivenAttesterAlreadyRegisteredOnCanonical(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnCanonicalEqTrue givenCallerIsCanonical {
    // it reverts

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), depositAmount);
    gse.deposit(_attester, _withdrawer, true);
    vm.stopPrank();

    address magic = gse.CANONICAL_MAGIC_ADDRESS();

    vm.prank(_instance);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, magic, _attester)
    );
    gse.deposit(_attester, _withdrawer, onCanonical);
  }

  function test_GivenAttesterNotRegisteredAnywhere(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnCanonicalEqTrue givenCallerIsCanonical {
    // it adds attester to canonical instance
    // it sets attester config with withdrawer
    // it delegates attester to canonical if not delegated
    // it increases delegation balance
    // it transfers staking asset from rollup to GSE
    // it approves staking asset to governance
    // it deposits staking asset to governance
    // it emits Deposit event

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.prank(_instance);
    stakingAsset.approve(address(gse), depositAmount);

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(gse.CANONICAL_MAGIC_ADDRESS(), _attester), false);

    address instance = onCanonical ? gse.CANONICAL_MAGIC_ADDRESS() : _instance;

    vm.expectEmit(true, true, true, true);
    emit IGSECore.Deposit(instance, _attester, _withdrawer);
    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, onCanonical);

    assertEq(stakingAsset.balanceOf(address(gse.getGovernance())), depositAmount);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);

    assertEq(gse.isRegistered(instance, _attester), true);
    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.getDelegatee(instance, _attester), gse.CANONICAL_MAGIC_ADDRESS());
    assertEq(gse.getDelegatee(_instance, _attester), address(0));
    assertEq(gse.getConfig(instance, _attester).withdrawer, _withdrawer);
    assertEq(gse.balanceOf(instance, _attester), depositAmount);
    assertEq(gse.balanceOf(_instance, _attester), 0);
    assertEq(gse.effectiveBalanceOf(instance, _attester), depositAmount);
    assertEq(gse.effectiveBalanceOf(_instance, _attester), depositAmount);
    assertEq(gse.supplyOf(instance), depositAmount);
    assertEq(gse.supplyOf(_instance), 0);
    assertEq(gse.totalSupply(), depositAmount);
  }

  modifier givenOnCanonicalEqFalse() {
    onCanonical = false;
    _;
  }

  function test_GivenAttesterAlreadyRegisteredOnSpecificInstance2(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnCanonicalEqFalse {
    // it reverts

    // @todo note that this test is exactly the same as test_GivenAttesterAlreadyRegisteredOnSpecificInstance
    // the only diff is `onCanonical = false` here. We could consider slamming them together, but to be
    // explicit we are not doing that.

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), depositAmount);
    gse.deposit(_attester, _withdrawer, false);
    vm.stopPrank();

    vm.prank(_instance);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, _instance, _attester)
    );
    gse.deposit(_attester, _withdrawer, onCanonical);
  }

  function test_GivenCallerIsCanonicalAndAttesterRegisteredOnCanonical(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnCanonicalEqFalse {
    // it reverts

    // Again, this one is essentially same as givenAttesterAlreadyREgisteredOnCanonical but with false.

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), depositAmount);
    gse.deposit(_attester, _withdrawer, true);
    vm.stopPrank();

    address magic = gse.CANONICAL_MAGIC_ADDRESS();

    vm.prank(_instance);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, magic, _attester)
    );
    gse.deposit(_attester, _withdrawer, onCanonical);
  }

  modifier givenAttesterNotRegisteredOnSpecificInstance() {
    _;
  }

  function test_GivenCallerIsCanonicalAndAttesterNotRegisteredOnCanonical(
    address _instance,
    address _attester,
    address _withdrawer
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    givenOnCanonicalEqFalse
    givenAttesterNotRegisteredOnSpecificInstance
  {
    // it adds attester to specific instance
    // it sets attester config with withdrawer
    // it delegates attester to instance if not delegated
    // it increases delegation balance
    // it transfers staking asset from rollup to GSE
    // it approves staking asset to governance
    // it deposits staking asset to governance
    // it emits Deposit event

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.prank(_instance);
    stakingAsset.approve(address(gse), depositAmount);

    address magic = gse.CANONICAL_MAGIC_ADDRESS();

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(magic, _attester), false);

    vm.expectEmit(true, true, true, true);
    emit IGSECore.Deposit(_instance, _attester, _withdrawer);
    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, onCanonical);

    assertEq(stakingAsset.balanceOf(address(gse.getGovernance())), depositAmount);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);

    assertEq(gse.isRegistered(_instance, _attester), true);
    assertEq(gse.isRegistered(magic, _attester), false);
    assertEq(gse.getDelegatee(_instance, _attester), _instance);
    assertEq(gse.getDelegatee(magic, _attester), address(0));
    assertEq(gse.getConfig(_instance, _attester).withdrawer, _withdrawer);
    assertEq(gse.balanceOf(_instance, _attester), depositAmount);
    assertEq(gse.balanceOf(magic, _attester), 0);
    assertEq(gse.effectiveBalanceOf(_instance, _attester), depositAmount);
    assertEq(gse.effectiveBalanceOf(magic, _attester), 0); // special case
    assertEq(gse.supplyOf(_instance), depositAmount);
    assertEq(gse.supplyOf(magic), 0);
    assertEq(gse.totalSupply(), depositAmount);
  }

  function test_GivenCallerIsNotCanonical2(
    address _instance,
    address _instance2,
    address _attester,
    address _withdrawer
  )
    external
    whenCallerIsRegisteredRollup(_instance)
    whenCallerIsRegisteredRollup(_instance2)
    givenOnCanonicalEqFalse
    givenAttesterNotRegisteredOnSpecificInstance
  {
    // it adds attester to specific instance
    // it sets attester config with withdrawer
    // it delegates attester to instance if not delegated
    // it increases delegation balance
    // it transfers staking asset from rollup to GSE
    // it approves staking asset to governance
    // it deposits staking asset to governance
    // it emits Deposit event

    // @todo exactly the same as above, with only diff being not canonical

    uint256 depositAmount = gse.DEPOSIT_AMOUNT();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), depositAmount);

    vm.prank(_instance);
    stakingAsset.approve(address(gse), depositAmount);

    address magic = gse.CANONICAL_MAGIC_ADDRESS();

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(magic, _attester), false);

    vm.expectEmit(true, true, true, true);
    emit IGSECore.Deposit(_instance, _attester, _withdrawer);
    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, onCanonical);

    assertEq(stakingAsset.balanceOf(address(gse.getGovernance())), depositAmount);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);

    assertEq(gse.isRegistered(_instance, _attester), true);
    assertEq(gse.isRegistered(magic, _attester), false);
    assertEq(gse.getDelegatee(_instance, _attester), _instance);
    assertEq(gse.getDelegatee(magic, _attester), address(0));
    assertEq(gse.getConfig(_instance, _attester).withdrawer, _withdrawer);
    assertEq(gse.balanceOf(_instance, _attester), depositAmount);
    assertEq(gse.balanceOf(magic, _attester), 0);
    assertEq(gse.effectiveBalanceOf(_instance, _attester), depositAmount);
    assertEq(gse.effectiveBalanceOf(magic, _attester), 0); // special case
    assertEq(gse.supplyOf(_instance), depositAmount);
    assertEq(gse.supplyOf(magic), 0);
    assertEq(gse.totalSupply(), depositAmount);
  }
}
