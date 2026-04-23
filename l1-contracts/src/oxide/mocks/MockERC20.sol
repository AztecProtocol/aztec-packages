// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
  constructor() ERC20("Mock", "MCK") {}

  function mint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
