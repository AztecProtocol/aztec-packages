// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Gerousia} from "@aztec/governance/Gerousia.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

contract FakeApella {
  address immutable GEROUSIA;

  mapping(IPayload => bool) public proposals;

  constructor(address _gerousia) {
    GEROUSIA = _gerousia;
  }

  function propose(IPayload _proposal) external returns (bool) {
    proposals[_proposal] = true;
    return true;
  }
}

contract GerousiaBase is Test {
  Registry internal registry;
  FakeApella internal apella;
  Gerousia internal gerousia;

  function setUp() public virtual {
    registry = new Registry(address(this));

    gerousia = new Gerousia(registry, 667, 1000);
    apella = new FakeApella(address(gerousia));

    registry.transferOwnership(address(apella));
  }
}
