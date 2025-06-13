// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering
// solhint-disable private-vars-leading-underscore

contract SetDepositsPerMintTest is StakingAssetHandlerBase {
  uint256 internal constant INITIAL_DEPOSITS_PER_MINT = 1;

  function setUp() public override {
    depositsPerMint = INITIAL_DEPOSITS_PER_MINT;
    super.setUp();
  }

  function test_WhenCallerOfSetDepositsPerMintIsNotOwner(address _caller) external {
    vm.assume(_caller != address(this));
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setDepositsPerMint(INITIAL_DEPOSITS_PER_MINT);
  }

  modifier whenCallerOfSetDepositsPerMintIsOwner() {
    // caller is owner by default
    _;
  }

  function test_WhenDepositsPerMintIs0() external whenCallerOfSetDepositsPerMintIsOwner {
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.CannotMintZeroAmount.selector));
    stakingAssetHandler.setDepositsPerMint(0);
  }

  function test_WhenDepositsPerMintIsNot0(uint256 _newDepositsPerMint)
    external
    whenCallerOfSetDepositsPerMintIsOwner
  {
    _newDepositsPerMint = bound(_newDepositsPerMint, 1, 1000);
    // it sets the deposits per mint
    // it emits a {DepositsPerMintUpdated} event
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.DepositsPerMintUpdated(_newDepositsPerMint);
    stakingAssetHandler.setDepositsPerMint(_newDepositsPerMint);
    assertEq(stakingAssetHandler.depositsPerMint(), _newDepositsPerMint);
  }

  function test_WhenOwnerAddsValidators(uint256 _depositsPerMint) external {
    // Always accept the fake proofs
    setMockZKPassportVerifier();

    address caller = address(0xbeefdeef);

    // it can add up to the deposits per mint without minting
    _depositsPerMint = bound(_depositsPerMint, 1, 50);
    address[] memory validators = new address[](_depositsPerMint);
    for (uint256 i = 0; i < _depositsPerMint; i++) {
      validators[i] = address(uint160(i + 1));
    }

    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    address rollup = stakingAssetHandler.getRollup();

    for (uint256 i = 0; i < _depositsPerMint; i++) {
      vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
      emit IStakingAssetHandler.AddedToQueue(validators[i], validators[i], 1 + i);
      vm.prank(caller);
      stakingAssetHandler.addValidatorToQueue(validators[i], validators[i], realProof);

      // Increase the unique identifier in our zkpassport proof such that the nullifier for each validator is different.
      mockZKPassportVerifier.incrementUniqueIdentifier();
    }
    assertEq(stakingAssetHandler.getQueueLength(), _depositsPerMint);

    for (uint256 i = 0; i < _depositsPerMint; i++) {
      vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
      emit IStakingAssetHandler.ValidatorAdded(rollup, validators[i], validators[i], WITHDRAWER);
    }
    // Drip the queue to allow validators to join the set
    stakingAssetHandler.dripQueue();
    assertEq(stakingAssetHandler.getQueueLength(), 0);

    uint256 lastMintTimestamp = stakingAssetHandler.lastMintTimestamp();

    emit log_named_uint("balance", stakingAsset.balanceOf(address(stakingAssetHandler)));

    // Added to the queue successfully
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddedToQueue(
      address(0xbeefdeef), address(0xbeefdeef), _depositsPerMint + 1
    );
    vm.prank(caller);
    stakingAssetHandler.addValidatorToQueue(address(0xbeefdeef), address(0xbeefdeef), realProof);

    // it reverts when adding one more validator
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.ValidatorQuotaFilledUntil.selector, lastMintTimestamp + mintInterval
      )
    );
    stakingAssetHandler.dripQueue();

    emit log_named_uint("balance", stakingAsset.balanceOf(address(stakingAssetHandler)));
  }
}
