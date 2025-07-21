// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {AttesterView, Exit, Status, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract AddValidatorTest is StakingAssetHandlerBase {
  using stdStorage for StdStorage;

  address public unhinged = address(0xdead);
  ProofVerificationParams private _proof;

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
      stakingAssetHandler.addValidator(_attester, validMerkleProof, fakeProof);

      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester, address(this));

      Exit memory exit = staking.getExit(_attester);
      vm.warp(Timestamp.unwrap(exit.exitableAt));
    }

    vm.prank(unhinged);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, fakeProof);

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

    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ValidatorQuotaFilledUntil.selector, revertTimestamp
      )
    );
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, realProof);
  }

  function test_WhenSufficientTimePassed(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceLTDepositamount
    givenPassportProofIsValid
  {
    // it adds the validator to the queue
    // it emits a {ValidatorAdded} event
    // it mints staking asset
    // it emits a {ToppedUp} event
    // it updates the lastMintTimestamp
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event

    vm.assume(_attester != address(0) && _attester != unhinged && _caller != address(this));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(DEPOSIT_AMOUNT * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, realProof);

    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT);
    assertTrue(attesterView.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  modifier givenPassportProofIsValid() {
    _proof = realProof;

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
    emit IStakingAssetHandler.ToppedUp(DEPOSIT_AMOUNT * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, _proof);

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

    stakingAssetHandler.setDepositsPerMint(10);

    uint256 revertTimestamp = block.timestamp + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, _proof);

    uint256 uniqueIdentifierLocation = _proof.publicInputs.length - 16 - 1;
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.SybilDetected.selector, _proof.publicInputs[uniqueIdentifierLocation]
      )
    );
    // Call from somebody else
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, _proof);
  }

  function test_WhenPassportProofIsInDevMode(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts
    _proof.devMode = true;

    vm.assume(
      _attester != address(0) && _caller != address(this) && _attester != address(this)
        && _attester != unhinged
    );
    uint256 revertTimestamp = block.timestamp + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidProof.selector));
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, _proof);
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
    stakingAssetHandler.addValidator(attester, validMerkleProof, _proof);
  }

  function test_WhenFlushEntryQueueReverts(address _caller, address _attester)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event
    // it does not revert even though flushEntryQueue reverts
    // it shows the validator was added to the queue

    vm.assume(
      _attester != address(0) && _caller != address(this) && _attester != address(this)
        && _caller != unhinged
    );

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    // Mock flushEntryQueue to revert
    vm.mockCallRevert(
      address(staking),
      abi.encodeWithSelector(IStakingCore.flushEntryQueue.selector),
      bytes(string("flushEntryQueue failed"))
    );

    uint256 queueLengthBefore = staking.getEntryQueueLength();

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(DEPOSIT_AMOUNT * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, validMerkleProof, _proof);

    // Validator should be added to the queue
    assertEq(staking.getEntryQueueLength(), queueLengthBefore + 1, "validator should be in queue");

    // Validator should not be active yet since flushEntryQueue failed
    AttesterView memory attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.effectiveBalance, 0, "validator should not be active yet");
    assertTrue(attesterView.status == Status.NONE, "validator should not be active yet");

    // Clear the mock and manually flush the queue to verify the validator can be processed
    vm.clearMockedCalls();
    staking.flushEntryQueue();

    // Now validator should be active
    attesterView = staking.getAttesterView(_attester);
    assertEq(attesterView.config.withdrawer, WITHDRAWER);
    assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT);
    assertTrue(attesterView.status == Status.VALIDATING);
  }
}
