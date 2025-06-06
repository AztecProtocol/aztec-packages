// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {AttesterView, Exit, Status} from "@aztec/core/interfaces/IStaking.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract AddValidatorTest is StakingAssetHandlerBase {
  using stdStorage for StdStorage;

  address public unhinged = address(0xdead);

  function setUp() public override {
    super.setUp();
    stakingAssetHandler.addUnhinged(unhinged);
  }

  function test_WhenCallerIsUnhinged(address _attester, bool _isExiting) external {
    // it exits the attester if needed
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event
    vm.assume(_attester != address(0));

    // If exiting, we need to create a sequencer that can be exited and exit it first.
    if (_isExiting) {
      vm.prank(unhinged);
      stakingAssetHandler.addValidator(_attester);

      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester, address(this));

      Exit memory exit = staking.getExit(_attester);
      vm.warp(Timestamp.unwrap(exit.exitableAt));
    }

    vm.prank(unhinged);
    stakingAssetHandler.addValidator(_attester);

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, MINIMUM_STAKE);
    assertTrue(attesterView.status == Status.VALIDATING);
  }

  modifier whenCallerIsNotUnhinged(address _caller) {
    vm.assume(!stakingAssetHandler.isUnhinged(_caller));
    _;
  }

  modifier givenBalanceLTDepositamount() {
    _;
  }

  function test_WhenInsufficientTimePassed(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceLTDepositamount
  {
    // it reverts
    vm.assume(_attester != address(0));

    // We overwrite the lastMintTimestamp to be now such that we can see if will revert.
    stdstore.target(address(stakingAssetHandler)).sig("lastMintTimestamp()").checked_write(
      block.timestamp
    );

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester);

    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ValidatorQuotaFilledUntil.selector, revertTimestamp
      )
    );
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();
  }

  function test_WhenSufficientTimePassed(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceLTDepositamount
  {
    // it mints staking asset
    // it emits a {ToppedUp} event
    // it updates the lastMintTimestamp
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(_attester != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, MINIMUM_STAKE);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  function test_GivenBalanceGEDepositAmount(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
  {
    // it exits the attester if needed
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(_attester != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, MINIMUM_STAKE);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  function test_GivenTheDepositCallFails(
    address _caller,
    address _attester,
    address _secondAttester,
    address _thirdAttester
  ) external whenCallerIsNotUnhinged(_caller) {
    // it deposits into the rollup
    // it does not revert if the deposit call fails
    // it emits a {ValidatorAdded} event for the first attester
    // it emits a {ValidatorAdded} event for the third attester

    vm.assume(
      _attester != address(0) && _secondAttester != address(0) && _thirdAttester != address(0)
    );
    vm.assume(
      _attester != _secondAttester && _attester != _thirdAttester
        && _secondAttester != _thirdAttester
    );

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval + mintInterval;
    vm.warp(revertTimestamp);

    // Allow more than one deposit per mint
    uint256 _depositsPerMint = 5;
    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester);

    // later we will mock that this deposit call fails
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_secondAttester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_secondAttester);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_thirdAttester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_thirdAttester);

    // Expected successful events
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * _depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _thirdAttester, WITHDRAWER);

    // Mock that the second add validator call will fail
    vm.mockCallRevert(
      address(staking),
      abi.encodeWithSelector(IStakingCore.deposit.selector, _secondAttester, WITHDRAWER, true),
      bytes(string(""))
    );
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, MINIMUM_STAKE);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);

    // Check that the _secondAttester is not added
    AttesterView memory secondAttesterView = staking.getAttesterView(_secondAttester);
    assertTrue(secondAttesterView.status == Status.NONE);

    // Check that the _thirdAttester is added
    AttesterView memory thirdAttesterView = staking.getAttesterView(_thirdAttester);
    assertEq(thirdAttesterView.config.withdrawer, WITHDRAWER);
    assertEq(thirdAttesterView.effectiveBalance, MINIMUM_STAKE);
    assertTrue(thirdAttesterView.status == Status.VALIDATING);
  }
}
