// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";

contract DepositTest is WithGSE {
  address internal caller;
  bool internal onBonus = false;

  function test_WhenCallerIsNotRegisteredRollup(address _instance) external {
    // it reverts

    vm.assume(gse.isRollupRegistered(_instance) == false);

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotRollup.selector, _instance));
    gse.deposit(address(1), address(0), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);
  }

  modifier whenCallerIsRegisteredRollup(address _instance) {
    vm.assume(_instance != address(0) && _instance != gse.BONUS_INSTANCE_ADDRESS());
    vm.assume(gse.isRollupRegistered(_instance) == false);

    vm.prank(gse.owner());
    gse.addRollup(_instance);

    _;
  }

  modifier givenOnBonusEqTrue() {
    onBonus = true;
    _;
  }

  function test_GivenCallerIsNotLatest(address _instance1, address _instance2)
    external
    whenCallerIsRegisteredRollup(_instance1)
    whenCallerIsRegisteredRollup(_instance2)
    givenOnBonusEqTrue
  {
    // it reverts

    vm.prank(_instance1);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__NotLatestRollup.selector, _instance1));
    gse.deposit(address(1), address(0), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);
  }

  modifier givenCallerIsLatest() {
    _;
  }

  function test_GivenAttesterAlreadyRegisteredOnSpecificInstance(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnBonusEqTrue givenCallerIsLatest {
    // it reverts
    vm.assume(_attester != address(0));

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    vm.stopPrank();

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, _instance, _attester));
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);
  }

  function test_GivenAttesterAlreadyRegisteredOnBonus(address _instance, address _attester, address _withdrawer)
    external
    whenCallerIsRegisteredRollup(_instance)
    givenOnBonusEqTrue
    givenCallerIsLatest
  {
    // it reverts
    vm.assume(_attester != address(0));

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);
    vm.stopPrank();

    address bonus = gse.BONUS_INSTANCE_ADDRESS();

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, bonus, _attester));
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);
  }

  function test_GivenAttesterNotRegisteredAnywhere(address _instance, address _attester, address _withdrawer)
    external
    whenCallerIsRegisteredRollup(_instance)
    givenOnBonusEqTrue
    givenCallerIsLatest
  {
    // it adds attester to bonus instance
    // it sets attester config with withdrawer
    // it delegates attester to bonus if not delegated
    // it increases delegation balance
    // it transfers staking asset from rollup to GSE
    // it approves staking asset to governance
    // it deposits staking asset to governance
    // it emits Deposit event

    vm.assume(_attester != address(0));

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.prank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(gse.BONUS_INSTANCE_ADDRESS(), _attester), false);

    address instance = onBonus ? gse.BONUS_INSTANCE_ADDRESS() : _instance;

    vm.expectEmit(true, true, true, true);
    emit IGSECore.Deposit(instance, _attester, _withdrawer);
    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);

    assertEq(stakingAsset.balanceOf(address(gse.getGovernance())), activationThreshold);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);

    assertEq(gse.isRegistered(instance, _attester), true);
    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.getDelegatee(instance, _attester), gse.BONUS_INSTANCE_ADDRESS());
    assertEq(gse.getDelegatee(_instance, _attester), address(0));
    assertEq(gse.getConfig(_attester).withdrawer, _withdrawer);
    assertEq(gse.balanceOf(instance, _attester), activationThreshold);
    assertEq(gse.balanceOf(_instance, _attester), 0);
    assertEq(gse.effectiveBalanceOf(instance, _attester), activationThreshold);
    assertEq(gse.effectiveBalanceOf(_instance, _attester), activationThreshold);
    assertEq(gse.supplyOf(instance), activationThreshold);
    assertEq(gse.supplyOf(_instance), 0);
    assertEq(gse.totalSupply(), activationThreshold);
  }

  modifier givenOnBonusEqFalse() {
    onBonus = false;
    _;
  }

  function test_GivenAttesterAlreadyRegisteredOnSpecificInstance2(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnBonusEqFalse {
    // it reverts

    // @todo note that this test is exactly the same as test_GivenAttesterAlreadyRegisteredOnSpecificInstance
    // the only diff is `onBonus = false` here. We could consider slamming them together, but to be
    // explicit we are not doing that.

    vm.assume(_attester != address(0));

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    vm.stopPrank();

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, _instance, _attester));
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);
  }

  function test_GivenCallerIsLatestAndAttesterRegisteredOnBonus(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnBonusEqFalse {
    // it reverts

    vm.assume(_attester != address(0));

    // Again, this one is essentially same as test_GivenAttesterAlreadyRegisteredOnBonus but with false.

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.startPrank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);
    vm.stopPrank();

    address bonus = gse.BONUS_INSTANCE_ADDRESS();

    vm.prank(_instance);
    vm.expectRevert(abi.encodeWithSelector(Errors.GSE__AlreadyRegistered.selector, bonus, _attester));
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);
  }

  modifier givenAttesterNotRegisteredOnSpecificInstance() {
    _;
  }

  function test_GivenCallerIsLatestAndAttesterNotRegisteredOnBonus(
    address _instance,
    address _attester,
    address _withdrawer
  ) external whenCallerIsRegisteredRollup(_instance) givenOnBonusEqFalse givenAttesterNotRegisteredOnSpecificInstance {
    // it adds attester to specific instance
    // it sets attester config with withdrawer
    // it delegates attester to instance if not delegated
    // it increases delegation balance
    // it transfers staking asset from rollup to GSE
    // it approves staking asset to governance
    // it deposits staking asset to governance
    // it emits Deposit event

    vm.assume(_attester != address(0));

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.prank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);

    address bonus = gse.BONUS_INSTANCE_ADDRESS();

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(bonus, _attester), false);

    vm.expectEmit(true, true, true, true);
    emit IGSECore.Deposit(_instance, _attester, _withdrawer);
    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);

    assertEq(stakingAsset.balanceOf(address(gse.getGovernance())), activationThreshold);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);

    assertEq(gse.isRegistered(_instance, _attester), true);
    assertEq(gse.isRegistered(bonus, _attester), false);
    assertEq(gse.getDelegatee(_instance, _attester), _instance);
    assertEq(gse.getDelegatee(bonus, _attester), address(0));
    assertEq(gse.getConfig(_attester).withdrawer, _withdrawer);
    assertEq(gse.balanceOf(_instance, _attester), activationThreshold);
    assertEq(gse.balanceOf(bonus, _attester), 0);
    assertEq(gse.effectiveBalanceOf(_instance, _attester), activationThreshold);
    assertEq(gse.effectiveBalanceOf(bonus, _attester), 0); // special case
    assertEq(gse.supplyOf(_instance), activationThreshold);
    assertEq(gse.supplyOf(bonus), 0);
    assertEq(gse.totalSupply(), activationThreshold);
  }

  function test_GivenCallerIsNotLatest2(address _instance, address _instance2, address _attester, address _withdrawer)
    external
    whenCallerIsRegisteredRollup(_instance)
    whenCallerIsRegisteredRollup(_instance2)
    givenOnBonusEqFalse
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

    vm.assume(_attester != address(0));

    // @todo exactly the same as above, with only diff being not latest

    uint256 activationThreshold = gse.ACTIVATION_THRESHOLD();

    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(_instance), activationThreshold);

    vm.prank(_instance);
    stakingAsset.approve(address(gse), activationThreshold);

    address bonus = gse.BONUS_INSTANCE_ADDRESS();

    assertEq(gse.isRegistered(_instance, _attester), false);
    assertEq(gse.isRegistered(bonus, _attester), false);

    vm.expectEmit(true, true, true, true);
    emit IGSECore.Deposit(_instance, _attester, _withdrawer);
    vm.prank(_instance);
    gse.deposit(_attester, _withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), onBonus);

    assertEq(stakingAsset.balanceOf(address(gse.getGovernance())), activationThreshold);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);

    assertEq(gse.isRegistered(_instance, _attester), true);
    assertEq(gse.isRegistered(bonus, _attester), false);
    assertEq(gse.getDelegatee(_instance, _attester), _instance);
    assertEq(gse.getDelegatee(bonus, _attester), address(0));
    assertEq(gse.getConfig(_attester).withdrawer, _withdrawer);
    assertEq(gse.balanceOf(_instance, _attester), activationThreshold);
    assertEq(gse.balanceOf(bonus, _attester), 0);
    assertEq(gse.effectiveBalanceOf(_instance, _attester), activationThreshold);
    assertEq(gse.effectiveBalanceOf(bonus, _attester), 0); // special case
    assertEq(gse.supplyOf(_instance), activationThreshold);
    assertEq(gse.supplyOf(bonus), 0);
    assertEq(gse.totalSupply(), activationThreshold);
  }
}
