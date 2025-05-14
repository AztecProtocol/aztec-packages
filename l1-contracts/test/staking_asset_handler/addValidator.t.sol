// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Fakerollup} from "../governance/governance-proposer/mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {FullStatus, Exit, Status} from "@aztec/core/interfaces/IStaking.sol";
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

  function test_WhenCallerIsUnhinged(address _attester, address _proposer, bool _isExiting)
    external
  {
    // it exits the attester if needed
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event
    vm.assume(_attester != address(0) && _proposer != address(0));

    // If exiting, we need to create a sequencer that can be exited and exit it first.
    if (_isExiting) {
      vm.prank(unhinged);
      stakingAssetHandler.addValidator(_attester, _proposer);

      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester, address(this));

      Exit memory exit = staking.getExit(_attester);
      vm.warp(Timestamp.unwrap(exit.exitableAt));
    }

    vm.prank(unhinged);
    stakingAssetHandler.addValidator(_attester, _proposer);

    FullStatus memory info = staking.getFullStatus(_attester);
    assertEq(info.info.proposer, _proposer);
    assertEq(info.info.withdrawer, WITHDRAWER);
    assertEq(info.effectiveBalance, MINIMUM_STAKE);
    assertTrue(info.status == Status.VALIDATING);
  }

  modifier whenCallerIsNotUnhinged(address _caller) {
    vm.assume(!stakingAssetHandler.isUnhinged(_caller));
    _;
  }

  modifier givenBalanceLTDepositamount() {
    _;
  }

  function test_WhenInsufficientTimePassed(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceLTDepositamount
  {
    // it reverts
    vm.assume(_attester != address(0) && _proposer != address(0));

    // We overwrite the lastMintTimestamp to be now such that we can see if will revert.
    stdstore.target(address(stakingAssetHandler)).sig("lastMintTimestamp()").checked_write(
      block.timestamp
    );

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;

    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ValidatorQuotaFilledUntil.selector, revertTimestamp
      )
    );
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer);
  }

  function test_WhenSufficientTimePassed(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceLTDepositamount
  {
    // it mints staking asset
    // it emits a {ToppedUp} event
    // it updates the lastMintTimestamp
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, _proposer, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer);

    FullStatus memory info = staking.getFullStatus(_attester);
    assertEq(info.info.proposer, _proposer);
    assertEq(info.info.withdrawer, WITHDRAWER);
    assertEq(info.effectiveBalance, MINIMUM_STAKE);
    assertTrue(info.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  function test_GivenBalanceGEDepositAmount(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
  {
    // it exits the attester if needed
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, _proposer, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer);

    FullStatus memory info = staking.getFullStatus(_attester);
    assertEq(info.info.proposer, _proposer);
    assertEq(info.info.withdrawer, WITHDRAWER);
    assertEq(info.effectiveBalance, MINIMUM_STAKE);
    assertTrue(info.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }
}
