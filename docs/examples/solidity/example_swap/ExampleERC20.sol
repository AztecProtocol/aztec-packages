// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {ERC20} from "@oz/token/ERC20/ERC20.sol";

/// @title ExampleERC20
/// @notice Minimal ERC20 with public mint for testing L1<>L2 swap flows.
contract ExampleERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    /// @notice Anyone can mint tokens (test only!)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
