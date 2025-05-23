// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IFeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {FeeAssetHandlerTestBase} from "./base.t.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract SetMintAmountTest is FeeAssetHandlerTestBase {
  function test_WhenCallerIsNotOwner(address _caller, uint256 _mintAmount) external {
    // it reverts
    vm.assume(_caller != feeAssetHandler.owner());
    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    feeAssetHandler.setMintAmount(_mintAmount);
  }

  function test_WhenCallerIsOwner(uint256 _mintAmount) external {
    // it updates the mint amount
    // it emits {MintAmountUpdated} event
    vm.expectEmit(true, true, true, true, address(feeAssetHandler));
    emit IFeeAssetHandler.MintAmountSet(_mintAmount);
    feeAssetHandler.setMintAmount(_mintAmount);
    assertEq(feeAssetHandler.mintAmount(), _mintAmount);
  }
}
