// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/ERC20.sol";
import {FeeAssetHandlerTestBase} from "./base.t.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract MintTest is FeeAssetHandlerTestBase {
  function test_WhenAnyoneCallsMint(address _caller, address _recipient) external {
    // it mints the mint amount to the recipient
    // it emits {Minted} event
    vm.assume(_recipient != address(0));
    vm.expectEmit(true, true, true, true, address(testERC20));
    emit IERC20.Transfer(address(0), _recipient, feeAssetHandler.mintAmount());
    vm.prank(_caller);
    feeAssetHandler.mint(_recipient);
    assertEq(testERC20.balanceOf(_recipient), feeAssetHandler.mintAmount());
  }
}
