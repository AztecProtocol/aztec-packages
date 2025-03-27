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
  uint256 internal constant MINT_INTERVAL = 1;
  uint256 internal constant INITIAL_DEPOSITS_PER_MINT = 1;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      MINT_INTERVAL,
      INITIAL_DEPOSITS_PER_MINT,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
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
    // it can add up to the deposits per mint without minting
    _depositsPerMint = bound(_depositsPerMint, 1, 1000);
    address[] memory validators = new address[](_depositsPerMint);
    for (uint256 i = 0; i < _depositsPerMint; i++) {
      validators[i] = address(uint160(i + 1));
    }

    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    for (uint256 i = 0; i < _depositsPerMint; i++) {
      vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
      emit IStakingAssetHandler.ValidatorAdded(validators[i], validators[i], WITHDRAWER);
      stakingAssetHandler.addValidator(validators[i], validators[i]);
    }

    // it reverts when adding one more validator
    vm.expectRevert(
      abi.encodeWithSelector(
        IStakingAssetHandler.NotEnoughTimeSinceLastMint.selector, block.timestamp, MINT_INTERVAL
      )
    );
    stakingAssetHandler.addValidator(
      address(uint160(_depositsPerMint)), address(uint160(_depositsPerMint + 2))
    );
  }
}
