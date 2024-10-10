// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Nomismatokopio} from "@aztec/governance/Nomismatokopio.sol";

contract NomismatokopioBase is Test {
  IMintableERC20 internal token;

  Nomismatokopio internal nom;

  function _deploy(uint256 _rate) internal {
    token = IMintableERC20(address(new TestERC20()));
    nom = new Nomismatokopio(token, _rate, address(this));
  }
}
