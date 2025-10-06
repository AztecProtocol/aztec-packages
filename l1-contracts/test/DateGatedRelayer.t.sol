// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {DateGatedRelayer} from "../src/periphery/DateGatedRelayer.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {CoinIssuer} from "@aztec/governance/CoinIssuer.sol";

contract DateGatedRelayerTest is Test {
  function test_notOwner(address _owner, address _caller) public {
    vm.assume(_owner != address(0));
    vm.assume(_caller != address(0));
    vm.assume(_caller != _owner);

    DateGatedRelayer dateGatedRelayer = new DateGatedRelayer(_owner, block.timestamp + 100);

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    dateGatedRelayer.relay(address(0), "");
  }

  function test_GateIsClosed(uint256 _gatedUntil, uint256 _warp) public {
    uint256 gatedUntil = bound(_gatedUntil, block.timestamp + 1, type(uint32).max);
    DateGatedRelayer dateGatedRelayer = new DateGatedRelayer(address(this), gatedUntil);

    uint256 warp = bound(_warp, 0, gatedUntil - 1);

    vm.warp(warp);
    vm.expectRevert(abi.encodeWithSelector(DateGatedRelayer.GateIsClosed.selector));
    dateGatedRelayer.relay(address(0), "");
  }

  function test_GateIsOpen(uint256 _gatedUntil, uint256 _warp) public {
    uint256 gatedUntil = bound(_gatedUntil, block.timestamp + 1, type(uint32).max);

    TestERC20 testERC20 = new TestERC20("test", "TEST", address(this));
    CoinIssuer coinIssuer = new CoinIssuer(testERC20, 100, address(this));
    testERC20.transferOwnership(address(coinIssuer));
    coinIssuer.acceptTokenOwnership();

    DateGatedRelayer dateGatedRelayer = new DateGatedRelayer(address(this), gatedUntil);
    coinIssuer.transferOwnership(address(dateGatedRelayer));

    uint256 warp = bound(_warp, gatedUntil, type(uint32).max);

    vm.expectRevert();
    coinIssuer.mint(address(this), 100);

    vm.warp(warp);
    dateGatedRelayer.relay(address(coinIssuer), abi.encodeWithSelector(CoinIssuer.mint.selector, address(this), 100));

    assertEq(testERC20.balanceOf(address(this)), 100);
  }
}
