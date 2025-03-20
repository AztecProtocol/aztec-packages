// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeAssetHandler, IFeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract FeeAssetHandlerTest is Test {
  TestERC20 internal testERC20;
  FeeAssetHandler internal feeAssetHandler;

  function setUp() external {
    testERC20 = new TestERC20("test", "TEST", address(this));
    feeAssetHandler = new FeeAssetHandler(address(this), address(testERC20), 100);
    testERC20.addMinter(address(feeAssetHandler));
  }

  function test_WhenTheOwnerSetsTheMintAmount(uint256 _mintAmount) external {
    // it sets the mint amount
    vm.expectEmit();
    emit IFeeAssetHandler.MintAmountSet(_mintAmount);
    feeAssetHandler.setMintAmount(_mintAmount);
    assertEq(feeAssetHandler.mintAmount(), _mintAmount);
  }

  function test_WhenANonOwnerSetsTheMintAmount(address _nonOwner) external {
    // it reverts
    vm.assume(_nonOwner != address(this));
    vm.prank(_nonOwner);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _nonOwner));
    feeAssetHandler.setMintAmount(100);
  }

  function test_WhenAnyoneCallsMint(address _recipient) external {
    // it mints the mint amount to the recipient
    vm.assume(_recipient != address(this));
    vm.assume(_recipient != address(0));
    feeAssetHandler.mint(_recipient);
    assertEq(testERC20.balanceOf(_recipient), feeAssetHandler.mintAmount());
  }
}
