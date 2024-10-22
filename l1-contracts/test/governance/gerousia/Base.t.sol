// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Gerousia} from "@aztec/governance/Gerousia.sol";

import {IApella} from "@aztec/governance/interfaces/IApella.sol";

contract FakeApella is IApella {
  address public gerousia;

  mapping(address => bool) public proposals;

  function setGerousia(address _gerousia) external {
    gerousia = _gerousia;
  }

  function propose(address _proposal) external override(IApella) returns (bool) {
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
    apella = new FakeApella();

    gerousia = new Gerousia(apella, registry, 667, 1000);

    apella.setGerousia(address(gerousia));
  }
}
