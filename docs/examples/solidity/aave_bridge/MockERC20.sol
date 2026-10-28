// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";

// docs:start:mock_erc20
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
// docs:end:mock_erc20
