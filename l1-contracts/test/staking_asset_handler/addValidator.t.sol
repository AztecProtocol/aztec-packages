// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {AttesterView, Exit, Status} from "@aztec/core/interfaces/IStaking.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract addValidatorToQueueTest is StakingAssetHandlerBase {
  using stdStorage for StdStorage;

  address public unhinged = address(0xdead);
  ProofVerificationParams private proof;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler.addUnhinged(unhinged);
  }

  function test_WhenCallerIsUnhinged(address _attester, bool _isExiting) external {
    // it exits the attester if needed
    // it deposits into the rollup
    // it does not need a valid proof
    // it emits a {ValidatorAdded} event
    vm.assume(_attester != address(0));

    // If exiting, we need to create a sequencer that can be exited and exit it first.
    if (_isExiting) {
      vm.prank(unhinged);
      stakingAssetHandler.addValidatorToQueue(_attester, fakeProof);

      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester, address(this));

      Exit memory exit = staking.getExit(_attester);
      vm.warp(Timestamp.unwrap(exit.exitableAt));
    }

    vm.prank(unhinged);
    stakingAssetHandler.addValidatorToQueue(_attester, fakeProof);

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT);
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
    givenPassportProofIsValid
  {
    // it reverts
    vm.assume(_attester != address(0));

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, 1);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, realProof);

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
    givenPassportProofIsValid
  {
    // it adds the validator to the queue
    // it emits an {AddedToQueue} event
    // it mints staking asset
    // it emits a {ToppedUp} event
    // it updates the lastMintTimestamp
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(_attester != address(0) && _attester != unhinged);
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, 1);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, realProof);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(DEPOSIT_AMOUNT * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  modifier givenPassportProofIsValid() {
    proof = realProof;

    // Set the lastMintTimestamp to be the same as the current timestamp such that our proof will be valid
    // block.timestamp is overriden to be the time of the proof in ZKPassportBase constructor
    stdstore.target(address(stakingAssetHandler)).sig("lastMintTimestamp()").checked_write(
      block.timestamp
    );
    _;
  }

  modifier givenBalanceGEDepositAmount() {
    _;
  }

  function test_WhenUserIsNew(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it exits the attester if needed
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(
      _attester != address(0) && _caller != address(this) && _attester != address(this)
        && _caller != unhinged
    );
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, 1);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, proof);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(DEPOSIT_AMOUNT * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  function test_WhenPassportProofHasBeenUsed(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts
    vm.assume(
      _attester != address(0) && _caller != address(this) && _attester != address(this)
        && _caller != unhinged
    );

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, 1);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, proof);

    uint256 uniqueIdentifierLocation = proof.publicInputs.length - 16 - 1;
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.SybilDetected.selector, proof.publicInputs[uniqueIdentifierLocation]
      )
    );
    // Call from somebody else
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, proof);
  }

  function test_WhenPassportProofIsInDevMode(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts
    proof.devMode = true;

    vm.assume(
      _attester != address(0) && _caller != address(this) && _attester != address(this)
        && _attester != unhinged
    );
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidProof.selector));
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, proof);
  }

  function test_WhenPassportProofIsInThePast(address _caller, uint16 _daysInFuture)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts

    vm.assume(_daysInFuture > 8);
    vm.assume(_caller != address(this) && _caller != unhinged);

    address attester = address(uint160(42));

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp + uint256(_daysInFuture) * 24 * 60 * 60);

    vm.expectRevert("Proof expired or date is invalid");
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(attester, proof);
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
    setMockZKPassportVerifier();

    vm.assume(
      _attester != address(0) && _secondAttester != address(0) && _thirdAttester != address(0)
    );
    vm.assume(
      _attester != _secondAttester && _attester != _thirdAttester
        && _secondAttester != _thirdAttester
    );
    vm.assume(_caller != address(this) && _caller != unhinged);

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval + mintInterval;
    vm.warp(revertTimestamp);

    // Allow more than one deposit per mint
    uint256 _depositsPerMint = 5;
    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, 1);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_attester, realProof);

    // Increase the unique identifier in our zkpassport proof such that the nullifier for each validator is different.
    mockZKPassportVerifier.incrementUniqueIdentifier();

    // later we will mock that this deposit call fails, with a swapped attester
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_secondAttester, 2);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_secondAttester, realProof);

    mockZKPassportVerifier.incrementUniqueIdentifier();

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_thirdAttester, 3);
    vm.prank(_caller);
    stakingAssetHandler.addValidatorToQueue(_thirdAttester, realProof);

    // Expected successful events
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(DEPOSIT_AMOUNT * _depositsPerMint);
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
    assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);

    // Check that the _secondAttester is not added
    AttesterView memory secondAttesterView = staking.getAttesterView(_secondAttester);
    assertTrue(secondAttesterView.status == Status.NONE);

    // Check that the _thirdAttester is added
    AttesterView memory thirdAttesterView = staking.getAttesterView(_thirdAttester);
    assertEq(thirdAttesterView.config.withdrawer, WITHDRAWER);
    assertEq(thirdAttesterView.effectiveBalance, DEPOSIT_AMOUNT);
    assertTrue(thirdAttesterView.status == Status.VALIDATING);
  }
}
