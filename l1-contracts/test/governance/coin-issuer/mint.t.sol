// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {CoinIssuerBase} from "./Base.t.sol";

contract MintTest is CoinIssuerBase {
  uint256 internal constant RATE = 1e18;
  uint256 internal maxMint;

  function setUp() public {
    _deploy(RATE);
    vm.warp(block.timestamp + 1000);

    maxMint = nom.mintAvailable();

    assertGt(maxMint, 0);
  }

  function test_GivenCallerIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    nom.mint(address(0xdead), 1);
  }

  modifier givenCallerIsOwner() {
    _;
  }

  function test_GivenAmountLargerThanMaxMint(uint256 _amount) external givenCallerIsOwner {
    // it reverts
    uint256 amount = bound(_amount, maxMint + 1, type(uint256).max);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.CoinIssuer__InssuficientMintAvailable.selector, maxMint, amount)
    );
    nom.mint(address(0xdead), amount);
  }

  function test_GivenAmountLessThanOrEqualMaxMint(uint256 _amount) external givenCallerIsOwner {
    // it updates timeOfLastMint
    // it mints amount
    // it emits a {Transfer} event
    // it will return 0 for mintAvailable in same block
    uint256 amount = bound(_amount, 1, maxMint);
    assertGt(amount, 0);
    uint256 balanceBefore = token.balanceOf(address(0xdead));

    vm.expectEmit(true, true, true, false, address(token));
    emit IERC20.Transfer(address(0), address(0xdead), amount);
    nom.mint(address(0xdead), amount);

    assertEq(token.balanceOf(address(0xdead)), balanceBefore + amount);
    assertEq(nom.mintAvailable(), 0);
    assertEq(nom.timeOfLastMint(), block.timestamp);
  }
}
