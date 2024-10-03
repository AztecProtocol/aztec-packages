// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Apella} from "@aztec/governance/Apella.sol";
import {Gerousia} from "@aztec/governance/Gerousia.sol";
import {Registry} from "@aztec/governance/Registry.sol";

import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract ApellaBase is TestBase {
  IMintableERC20 internal token;
  Registry internal registry;
  Apella internal apella;
  Gerousia internal gerousia;

  function setUp() public virtual {
    token = IMintableERC20(address(new TestERC20()));
    registry = new Registry(address(this));

    // @todo We should be using a bit of create2 magic to do this nicely
    apella = new Apella(token, address(0));
    gerousia = new Gerousia(apella, registry, 677, 1000);

    vm.store(address(apella), 0, bytes32(uint256(uint160(address(gerousia)))));

    registry.transferOwnership(address(apella));

    assertEq(apella.gerousia(), address(gerousia));
  }
}
