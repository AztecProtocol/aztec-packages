// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {CoinIssuerBase} from "./Base.t.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {CoinIssuer} from "@aztec/governance/CoinIssuer.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract MintAvailableTest is CoinIssuerBase {
  modifier givenRateIsNot0(uint256 _rate, uint256 _initialSupply) {
    uint256 rate = bound(_rate, 0.01e18, 10e18);
    uint256 initialSupply = bound(_initialSupply, 100, type(uint128).max);
    _deploy(rate, initialSupply);

    assertEq(rate, nom.NOMINAL_ANNUAL_PERCENTAGE_CAP());
    _;
  }

  function test_GivenSameTimeAsDeployment(uint256 _rate, uint256 _initialSupply)
    external
    givenRateIsNot0(_rate, _initialSupply)
  {
    // it returns full year 0 budget
    uint256 currentSupply = token.totalSupply();
    uint256 expected = Math.mulDiv(currentSupply, nom.NOMINAL_ANNUAL_PERCENTAGE_CAP(), 1e18, Math.Rounding.Floor);
    assertEq(nom.mintAvailable(), expected);
  }

  function test_GivenAfterDeployment(uint256 _rate, uint256 _initialSupply, uint256 _time)
    external
    givenRateIsNot0(_rate, _initialSupply)
  {
    // it returns that year's budget
    uint256 currentSupply = token.totalSupply();
    uint256 deploymentTime = nom.DEPLOYMENT_TIME();

    uint256 timeJump = bound(_time, 1, 10 * 365 days);
    vm.warp(deploymentTime + timeJump);

    uint256 expected = Math.mulDiv(currentSupply, nom.NOMINAL_ANNUAL_PERCENTAGE_CAP(), 1e18, Math.Rounding.Floor);

    assertEq(nom.mintAvailable(), expected);
  }

  function test_GivenExactlyOneYearElapsed(uint256 _rate, uint256 _initialSupply)
    external
    givenRateIsNot0(_rate, _initialSupply)
  {
    // it returns exactly rate * supply for year 1
    uint256 currentSupply = token.totalSupply();
    uint256 deploymentTime = nom.DEPLOYMENT_TIME();

    vm.warp(deploymentTime + 365 days);

    uint256 expected = Math.mulDiv(currentSupply, nom.NOMINAL_ANNUAL_PERCENTAGE_CAP(), 1e18, Math.Rounding.Floor);

    assertEq(nom.mintAvailable(), expected);
  }

  function test_GivenMultipleYearsElapsed(uint256 _years) external {
    // it always caps at 1 year maximum
    uint256 numYears = bound(_years, 2, 100);
    _deploy(1e18, 1_000_000);
    uint256 deploymentTime = nom.DEPLOYMENT_TIME();

    vm.warp(deploymentTime + numYears * 365 days);

    uint256 available = nom.mintAvailable();

    uint256 expectedOneYear = Math.mulDiv(token.totalSupply(), 1e18, 1e18, Math.Rounding.Floor);

    assertEq(available, expectedOneYear);
    assertEq(available, 1_000_000);
  }
}
