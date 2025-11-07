// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {CoinIssuerBase} from "./Base.t.sol";
import {ICoinIssuer} from "@aztec/governance/interfaces/ICoinIssuer.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {CoinIssuer} from "@aztec/governance/CoinIssuer.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";

contract ConstructorTest is CoinIssuerBase {
  function test_WhenBudgetEQ0(uint256 _rate, uint256 _supply) external {
    // it reverts

    // Bounds such that product will be < 1e18
    uint256 rate = bound(_rate, 0, 1e18 - 1);
    uint256 supply = rate == 0 ? bound(_supply, 1, type(uint128).max) : (1e18 - 1) / rate;
    uint256 expectedBudget = rate * supply / 1e18;

    emit log_named_uint("rate", rate);
    emit log_named_uint("supply", supply);
    emit log_named_uint("expectedBudget", expectedBudget);

    TestERC20 testERC20 = new TestERC20("test", "TEST", address(this));
    token = IMintableERC20(address(testERC20));

    token.mint(address(this), supply);

    vm.expectRevert(abi.encodeWithSelector(Errors.CoinIssuer__InvalidConfiguration.selector));
    nom = new CoinIssuer(token, rate, address(this));
  }

  function test_WhenBudgetNEQ0(uint256 _rate, uint256 _supply) external {
    // it stores the ASSET
    // it stores the NOMINAL_ANNUAL_PERCENTAGE_CAP
    // it stores the DEPLOYMENT_TIME
    // it stores cachedBudgetYear
    // it stores cachedBudget
    // it emits {BudgetReset}

    uint256 rate = bound(_rate, 0.01e18, 10e18);
    uint256 supply = bound(_supply, 1e18, type(uint128).max);
    uint256 expectedBudget = (supply * rate) / 1e18;
    emit log_named_uint("expectedBudget", expectedBudget);

    TestERC20 testERC20 = new TestERC20("test", "TEST", address(this));
    token = IMintableERC20(address(testERC20));

    token.mint(address(this), supply);

    vm.expectEmit(true, true, true, true);
    emit ICoinIssuer.BudgetReset(0, expectedBudget);
    nom = new CoinIssuer(token, rate, address(this));

    assertEq(address(nom.ASSET()), address(token));
    assertEq(nom.NOMINAL_ANNUAL_PERCENTAGE_CAP(), rate);
    assertEq(nom.DEPLOYMENT_TIME(), block.timestamp);
    assertEq(nom.cachedBudgetYear(), 0);
    assertEq(nom.cachedBudget(), expectedBudget);
  }
}
