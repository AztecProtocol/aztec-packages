// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";

// solhint-disable comprehensive-interface

contract EscrowERC20 is ERC20 {
  constructor() ERC20("TestToken", "TST") {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
