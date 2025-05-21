// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";
import {ValidatorInfo, Exit, Status} from "@aztec/core/interfaces/IStaking.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract AddValidatorTest is StakingAssetHandlerBase {
  using stdStorage for StdStorage;

  address public unhinged = address(0xdead);
  ProofVerificationParams private proof;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler.addUnhinged(unhinged);
  }

  function test_WhenCallerIsUnhinged(address _attester, address _proposer, bool _isExiting)
    external
  {
    // it exits the attester if needed
    // it deposits into the rollup
    // it does not need a valid proof
    // it emits a {ValidatorAdded} event
    vm.assume(_attester != address(0) && _proposer != address(0));

    // If exiting, we need to create a sequencer that can be exited and exit it first.
    if (_isExiting) {
      vm.prank(unhinged);
      stakingAssetHandler.addValidator(_attester, _proposer, fakeProof);

      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester, address(this));

      Exit memory exit = staking.getExit(_attester);
      vm.warp(Timestamp.unwrap(exit.exitableAt));
    }

    vm.prank(unhinged);
    stakingAssetHandler.addValidator(_attester, _proposer, fakeProof);

    ValidatorInfo memory info = staking.getInfo(_attester);
    assertEq(info.proposer, _proposer);
    assertEq(info.withdrawer, WITHDRAWER);
    assertEq(info.stake, MINIMUM_STAKE);
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
    givenPassportProofIsValid
  {
    // it reverts
    vm.assume(_attester != address(0) && _proposer != address(0));

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, _proposer);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer, realProof);

    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ValidatorQuotaFilledUntil.selector, revertTimestamp
      )
    );
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();
  }

  function test_WhenSufficientTimePassed(address _caller, address _attester, address _proposer)
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

    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, _proposer);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer, realProof);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, _proposer, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    ValidatorInfo memory info = staking.getInfo(_attester);
    assertEq(info.proposer, _proposer);
    assertEq(info.withdrawer, WITHDRAWER);
    assertEq(info.stake, MINIMUM_STAKE);
    assertTrue(info.status == Status.VALIDATING);

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

  function test_WhenUserIsNew(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it exits the attester if needed
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event
    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, _proposer);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer, proof);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, _proposer, WITHDRAWER);
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    ValidatorInfo memory info = staking.getInfo(_attester);
    assertEq(info.proposer, _proposer);
    assertEq(info.withdrawer, WITHDRAWER);
    assertEq(info.stake, MINIMUM_STAKE);
    assertTrue(info.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }

  function test_WhenPassportProofHasBeenUsed(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts
    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, _proposer);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer, proof);

    uint256 uniqueIdentifierLocation = proof.publicInputs.length - 16 - 1;
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.SybilDetected.selector, proof.publicInputs[uniqueIdentifierLocation]
      )
    );
    // Call from somebody else
    vm.prank(_proposer);
    stakingAssetHandler.addValidator(_proposer, _attester, proof);
  }

  function test_WhenPassportProofIsInDevMode(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts
    proof.devMode = true;

    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp);

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.InvalidProof.selector));
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer, proof);
  }

  function test_WhenPassportProofIsInThePast(address _caller, uint16 _daysInFuture)
    external
    whenCallerIsNotUnhinged(_caller)
    givenBalanceGEDepositAmount
    givenPassportProofIsValid
  {
    // it reverts

    vm.assume(_daysInFuture > 8);

    address attester = address(uint160(42));
    address proposer = address(uint160(42));

    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval;
    vm.warp(revertTimestamp + uint256(_daysInFuture) * 24 * 60 * 60);

    vm.expectRevert("Proof expired or date is invalid");
    vm.prank(_caller);
    stakingAssetHandler.addValidator(attester, proposer, proof);
  }

  function test_GivenTheDepositCallFails(address _caller, address _attester, address _proposer)
    external
    whenCallerIsNotUnhinged(_caller)
  {
    // it deposits into the rollup
    // it does not revert if the deposit call fails
    // it emits a {ValidatorAdded} event
    setMockZKPassportVerifier();

    vm.assume(_attester != address(0) && _proposer != address(0));
    uint256 revertTimestamp = stakingAssetHandler.lastMintTimestamp() + mintInterval + mintInterval;
    vm.warp(revertTimestamp);

    // Allow more than one deposit per mint
    uint256 _depositsPerMint = 5;
    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_attester, _proposer);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer, realProof);

    // Increase the unique identifier in our zkpassport proof such that the nullifier for each validator is different.
    mockZKPassportVerifier.incrementUniqueIdentifier();

    // later we will mock that this deposit call fails, with a swapped attester and proposer
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(_proposer, _attester);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_proposer, _attester, realProof);

    // Expected successful events
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * _depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), _attester, _proposer, WITHDRAWER);

    // Mock that the second add validator call will fail
    vm.mockCallRevert(
      address(stakingAssetHandler),
      abi.encodeWithSelector(
        IStakingCore.deposit.selector, _proposer, _attester, WITHDRAWER, MINIMUM_STAKE
      ),
      bytes(string(""))
    );
    vm.prank(_caller);
    stakingAssetHandler.dripQueue();

    ValidatorInfo memory info = staking.getInfo(_attester);
    assertEq(info.proposer, _proposer);
    assertEq(info.withdrawer, WITHDRAWER);
    assertEq(info.stake, MINIMUM_STAKE);
    assertTrue(info.status == Status.VALIDATING);

    assertEq(stakingAssetHandler.lastMintTimestamp(), block.timestamp);
  }
}
