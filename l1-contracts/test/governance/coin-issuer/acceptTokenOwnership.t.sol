// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {Ownable2Step} from "@oz/access/Ownable2Step.sol";
import {CoinIssuerBase} from "./Base.t.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {CoinIssuer} from "@aztec/governance/CoinIssuer.sol";

contract AcceptTokenOwnershipTest is CoinIssuerBase {
  function setUp() public {
    _deploy(1e18, 1_000_000);
  }

  function test_GivenCallerIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    nom.acceptTokenOwnership();
  }

  function test_GivenCallerIsOwnerButNoOwnershipTransferPending() external {
    // it reverts because ownership was already accepted in Base setup
    // Attempting to accept again should fail
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(nom)));
    nom.acceptTokenOwnership();
  }

  function test_GivenCallerIsOwnerAndOwnershipTransferPending() external {
    // it successfully accepts ownership of the token
    // We need to test the flow from a fresh deployment where ownership hasn't been accepted

    // Create token and CoinIssuer but don't call acceptTokenOwnership
    TestERC20 testERC20 = new TestERC20("test", "TEST", address(this));
    IMintableERC20 newToken = IMintableERC20(address(testERC20));
    newToken.mint(address(this), 1_000_000);
    CoinIssuer newNom = new CoinIssuer(newToken, 1e18, address(this));

    // Transfer ownership but don't accept yet
    testERC20.transferOwnership(address(newNom));

    // Verify pendingOwner is set but owner hasn't changed
    assertEq(Ownable(address(newToken)).owner(), address(this));
    assertEq(Ownable2Step(address(newToken)).pendingOwner(), address(newNom));

    // Accept ownership through CoinIssuer
    newNom.acceptTokenOwnership();

    // Verify ownership was transferred
    assertEq(Ownable(address(newToken)).owner(), address(newNom));
    assertEq(Ownable2Step(address(newToken)).pendingOwner(), address(0));
  }

  function test_GivenMultipleAcceptanceAttempts() external {
    // it should fail on second attempt since ownership already accepted
    // Create token and CoinIssuer
    TestERC20 testERC20 = new TestERC20("test", "TEST", address(this));
    IMintableERC20 newToken = IMintableERC20(address(testERC20));
    newToken.mint(address(this), 1_000_000);
    CoinIssuer newNom = new CoinIssuer(newToken, 1e18, address(this));

    // Transfer ownership
    testERC20.transferOwnership(address(newNom));

    // First acceptance should succeed
    newNom.acceptTokenOwnership();
    assertEq(Ownable(address(newToken)).owner(), address(newNom));

    // Second acceptance should fail (no pending ownership)
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(newNom)));
    newNom.acceptTokenOwnership();
  }
}
