// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract AddValidatorTest is StakingAssetHandlerBase {
  address public canAddValidator = address(0xdead);

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      10, // mintInterval, usually overridden in test
      3, // depositsPerMint, usually overridden in test
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
    stakingAssetHandler.grantAddValidatorPermission(canAddValidator);
  }

  function test_WhenCallerIsNotCanAddValidator(
    address _caller,
    address _attester,
    address _proposer
  ) external {
    // it reverts
    vm.assume(_caller != canAddValidator && _caller != address(this));
    vm.expectRevert(
      abi.encodeWithSelector(IStakingAssetHandler.NotCanAddValidator.selector, _caller)
    );
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer);
  }

  modifier whenCallerIsCanAddValidator() {
    // Use the canAddValidator address
    _;
  }

  modifier whenItNeedsToMint() {
    // By default it needs to mint
    _;
  }

  function test_WhenNotEnoughTimeHasPassedSinceLastMint(uint256 _interval)
    external
    whenCallerIsCanAddValidator
    whenItNeedsToMint
  {
    _interval = bound(_interval, block.timestamp + 1, block.timestamp + 1e18);
    stakingAssetHandler.setMintInterval(_interval);

    // it reverts
    vm.expectRevert(
      abi.encodeWithSelector(IStakingAssetHandler.NotEnoughTimeSinceLastMint.selector, 0, _interval)
    );
    vm.prank(canAddValidator);
    stakingAssetHandler.addValidator(address(0), address(0));
  }

  modifier whenEnoughTimeHasPassedSinceLastMint(uint256 _interval) {
    _interval = bound(_interval, block.timestamp + 1, block.timestamp + 1e18);
    stakingAssetHandler.setMintInterval(_interval);
    vm.warp(block.timestamp + _interval);
    _;
  }

  function test_WhenEnoughTimeHasPassedSinceLastMint(
    uint32 _interval,
    uint256 _depositsPerMint,
    address _attester,
    address _proposer
  )
    external
    whenCallerIsCanAddValidator
    whenItNeedsToMint
    whenEnoughTimeHasPassedSinceLastMint(_interval)
  {
    // it mints staking asset
    // it emits a {ToppedUp} event
    // it updates the lastMintTimestamp
    // it deposits into the rollup
    // it emits a {ValidatorAdded} event
    _depositsPerMint = bound(_depositsPerMint, 1, 1e18);
    vm.assume(_attester != address(0));
    vm.assume(_proposer != address(0));

    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ToppedUp(MINIMUM_STAKE * _depositsPerMint);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler.rollup()));
    emit IStakingCore.Deposit(_attester, _proposer, WITHDRAWER, stakingAssetHandler.depositAmount());
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(_attester, _proposer, WITHDRAWER);
    vm.prank(canAddValidator);
    stakingAssetHandler.addValidator(_attester, _proposer);

    assertEq(
      stakingAsset.balanceOf(address(stakingAssetHandler)),
      (stakingAssetHandler.depositsPerMint() - 1) * MINIMUM_STAKE
    );
  }

  function test_WhenItDoesNotNeedToMint(
    uint32 _interval,
    uint256 _depositsPerMint,
    address _attester,
    address _proposer
  ) external whenCallerIsCanAddValidator whenEnoughTimeHasPassedSinceLastMint(_interval) {
    vm.assume(_attester != address(0));
    vm.assume(_proposer != address(0));

    _depositsPerMint = bound(_depositsPerMint, 1, 1e18);

    deal(address(stakingAsset), address(stakingAssetHandler), MINIMUM_STAKE * _depositsPerMint);

    stakingAssetHandler.setDepositsPerMint(_depositsPerMint);

    // it deposits into the rollup
    // it emits a {Deposited} event
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler.rollup()));
    emit IStakingCore.Deposit(_attester, _proposer, WITHDRAWER, stakingAssetHandler.depositAmount());
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(_attester, _proposer, WITHDRAWER);
    vm.prank(canAddValidator);
    stakingAssetHandler.addValidator(_attester, _proposer);

    assertEq(
      stakingAsset.balanceOf(address(stakingAssetHandler)),
      (stakingAssetHandler.depositsPerMint() - 1) * MINIMUM_STAKE
    );
  }
}
