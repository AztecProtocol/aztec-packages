// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {MockERC20} from "./MockERC20.sol";
import {MockAToken} from "./MockAToken.sol";

// docs:start:mock_aave_pool
/// @notice A simplified mock of Aave V3's lending pool for tutorial purposes.
/// Supports supply and withdraw with a configurable yield in basis points.
contract MockAavePool {
    MockERC20 public underlyingToken;
    MockAToken public aToken;
    uint256 public yieldBps; // e.g. 1000 = 10%

    constructor(address _underlyingToken, address _aToken, uint256 _yieldBps) {
        underlyingToken = MockERC20(_underlyingToken);
        aToken = MockAToken(_aToken);
        yieldBps = _yieldBps;
    }

    /// @notice Deposit underlying tokens and receive aTokens (mimics Aave V3 IPool.supply)
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 /* referralCode */
    ) external {
        require(asset == address(underlyingToken), "Wrong asset");
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    /// @notice Withdraw underlying tokens by burning aTokens (mimics Aave V3 IPool.withdraw)
    /// Returns the original amount plus simulated yield
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(asset == address(underlyingToken), "Wrong asset");

        // Burn caller's aTokens
        aToken.burn(msg.sender, amount);

        // Simulate yield: return amount + yield
        uint256 yieldAmount = (amount * yieldBps) / 10000;
        uint256 totalReturn = amount + yieldAmount;

        // Mint extra underlying to cover yield (mock-only behavior)
        underlyingToken.mint(address(this), yieldAmount);

        // Transfer underlying + yield to recipient
        underlyingToken.transfer(to, totalReturn);
        return totalReturn;
    }
}
// docs:end:mock_aave_pool
