// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {ProofVerificationParams} from "@zkpassport/Types.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract ClaimTest is StakingAssetHandlerBase {
  using stdStorage for StdStorage;

  address public unhinged = address(0xdead);
  ProofVerificationParams private _proof;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler.addUnhinged(unhinged);
  }

  function test_WhenCallerIsUnhinged() external {
    // it transfers tokens to the caller
    // it does not need a valid proof
    // it emits a {Claimed} event

    uint256 balanceBefore = stakingAsset.balanceOf(unhinged);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.Claimed(unhinged, faucetAmount, bytes32(0));
    vm.prank(unhinged);
    stakingAssetHandler.claim(fakeProof);

    uint256 balanceAfter = stakingAsset.balanceOf(unhinged);
    assertEq(balanceAfter - balanceBefore, faucetAmount, "unhinged user should receive faucet amount");
  }

  function test_WhenUnhingedClaimsMultipleTimes() external {
    // it allows multiple claims without proof

    uint256 balanceBefore = stakingAsset.balanceOf(unhinged);

    vm.startPrank(unhinged);
    stakingAssetHandler.claim(fakeProof);
    stakingAssetHandler.claim(fakeProof);
    stakingAssetHandler.claim(fakeProof);
    vm.stopPrank();

    uint256 balanceAfter = stakingAsset.balanceOf(unhinged);
    assertEq(balanceAfter - balanceBefore, faucetAmount * 3, "unhinged user should receive 3x faucet amount");
  }

  modifier whenCallerIsNotUnhinged(address _caller) {
    vm.assume(_caller != address(stakingAssetHandler));
    vm.assume(!stakingAssetHandler.isUnhinged(_caller));
    _;
  }

  modifier givenPassportProofIsValid() {
    _proof = realProof;
    _;
  }

  function test_WhenUserClaimsWithValidProof(address _caller)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it validates the passport proof
    // it transfers tokens to the caller
    // it emits a {Claimed} event

    vm.assume(_caller != address(0) && _caller != address(this));

    uint256 balanceBefore = stakingAsset.balanceOf(_caller);

    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);

    uint256 balanceAfter = stakingAsset.balanceOf(_caller);
    assertEq(balanceAfter - balanceBefore, faucetAmount, "user should receive faucet amount");
  }

  function test_WhenPassportProofHasBeenUsed(address _caller, address _secondCaller)
    external
    whenCallerIsNotUnhinged(_caller)
    whenCallerIsNotUnhinged(_secondCaller)
    givenPassportProofIsValid
  {
    // it reverts with SybilDetected

    vm.assume(_caller != address(0) && _caller != address(this));
    vm.assume(_secondCaller != address(0) && _secondCaller != address(this));
    vm.assume(_caller != _secondCaller);

    // First claim succeeds
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);

    // Second claim with same proof should fail
    uint256 uniqueIdentifierLocation = _proof.proofVerificationData.publicInputs.length - 1;
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.SybilDetected.selector, _proof.proofVerificationData.publicInputs[uniqueIdentifierLocation]
      )
    );
    vm.prank(_secondCaller);
    stakingAssetHandler.claim(_proof);
  }

  function test_WhenPassportProofIsInDevMode(address _caller)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it reverts with InvalidProof
    _proof.serviceConfig.devMode = true;

    vm.assume(_caller != address(0) && _caller != address(this));

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidProof.selector));
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);
  }

  function test_WhenPassportProofIsExpired(address _caller, uint16 _daysInFuture)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it reverts

    vm.assume(_daysInFuture > 8);
    vm.assume(_caller != address(0) && _caller != address(this));

    vm.warp(block.timestamp + uint256(_daysInFuture) * 24 * 60 * 60);

    vm.expectRevert("The proof was generated outside the validity period");
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);
  }

  function test_WhenContractHasInsufficientBalance(address _caller)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it reverts with InsufficientBalance

    vm.assume(_caller != address(0) && _caller != address(this));

    // Drain the contract balance
    uint256 contractBalance = stakingAsset.balanceOf(address(stakingAssetHandler));
    vm.prank(address(stakingAssetHandler));
    stakingAsset.transfer(address(1), contractBalance);

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InsufficientBalance.selector));
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);
  }

  function test_WhenDomainIsInvalid(address _caller)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it reverts with InvalidDomain

    vm.assume(_caller != address(0) && _caller != address(this));

    _proof.serviceConfig.domain = "wrong.domain.com";

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidDomain.selector));
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);
  }

  function test_WhenScopeIsInvalid(address _caller)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it reverts with InvalidScope

    vm.assume(_caller != address(0) && _caller != address(this));

    _proof.serviceConfig.scope = "wrongscope";

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidScope.selector));
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);
  }

  function test_WhenValidityPeriodIsInvalid(address _caller)
    external
    whenCallerIsNotUnhinged(_caller)
    givenPassportProofIsValid
  {
    // it reverts with InvalidValidityPeriod

    vm.assume(_caller != address(0) && _caller != address(this));

    _proof.serviceConfig.validityPeriodInSeconds = 1 days; // Wrong validity period

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidValidityPeriod.selector));
    vm.prank(_caller);
    stakingAssetHandler.claim(_proof);
  }
}
