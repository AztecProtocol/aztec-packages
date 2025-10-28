// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {CoinIssuerBase} from "./Base.t.sol";
import {ICoinIssuer} from "@aztec/governance/interfaces/ICoinIssuer.sol";

contract MintTest is CoinIssuerBase {
  uint256 internal constant INITIAL_SUPPLY = 1_000_000;

  modifier withFuzzedRate(uint256 _rate) {
    uint256 rate = bound(_rate, 0.01e18, 10e18); // 1% to 1000%
    _deploy(rate, INITIAL_SUPPLY);
    assertGt(nom.mintAvailable(), 0);
    _;
  }

  function test_WhenCallerIsNotOwner(uint256 _rate, address _caller) external withFuzzedRate(_rate) {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    nom.mint(address(0xdead), 1);
  }

  modifier whenCallerIsOwner() {
    _;
  }

  function test_WhenAmountExceedsMaxMint(uint256 _rate, uint256 _amount)
    external
    withFuzzedRate(_rate)
    whenCallerIsOwner
  {
    // it reverts
    uint256 maxAvailable = nom.mintAvailable();
    vm.assume(maxAvailable < type(uint256).max);
    uint256 excessAmount = bound(_amount, maxAvailable + 1, type(uint256).max);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.CoinIssuer__InsufficientMintAvailable.selector, maxAvailable, excessAmount)
    );
    nom.mint(address(0xdead), excessAmount);
  }

  function test_WhenMintingToZeroAddress(uint256 _rate) external withFuzzedRate(_rate) whenCallerIsOwner {
    // it reverts
    uint256 maxAvailable = nom.mintAvailable();
    vm.expectRevert();
    nom.mint(address(0), maxAvailable);
  }

  function test_WhenMintingZeroAmount(uint256 _rate) external withFuzzedRate(_rate) whenCallerIsOwner {
    // it succeeds with no state changes
    uint256 balanceBefore = token.balanceOf(address(0xdead));
    uint256 totalSupplyBefore = token.totalSupply();
    nom.mint(address(0xdead), 0);
    assertEq(token.balanceOf(address(0xdead)), balanceBefore);
    assertEq(token.totalSupply(), totalSupplyBefore);
  }

  function test_WhenMintingNonZeroAmount(uint256 _rate, uint256 _amount)
    external
    withFuzzedRate(_rate)
    whenCallerIsOwner
  {
    // it mints correct amount
    // it emits a Transfer event
    // it preserves unused allowance
    uint256 maxAvailable = nom.mintAvailable();
    uint256 amount = bound(_amount, 1, maxAvailable);
    uint256 balanceBefore = token.balanceOf(address(0xdead));
    uint256 availableBefore = nom.mintAvailable();

    vm.expectEmit(true, true, true, false, address(token));
    emit IERC20.Transfer(address(0), address(0xdead), amount);
    nom.mint(address(0xdead), amount);

    assertEq(token.balanceOf(address(0xdead)), balanceBefore + amount);
    assertEq(nom.mintAvailable(), availableBefore - amount);
  }

  function test_WhenMultipleMintsWithinSameYear(
    uint256 _rate,
    uint256 _numMints,
    uint256[16] calldata _mintFractions,
    bool _lastMintIsFull
  ) external withFuzzedRate(_rate) whenCallerIsOwner {
    // it draws from same annual budget
    uint256 rate = nom.NOMINAL_ANNUAL_PERCENTAGE_CAP();
    uint256 deploymentTime = nom.DEPLOYMENT_TIME();
    uint256 totalMinted = 0;

    // Bound the number of mints between 1 and 16
    uint256 numMints = bound(_numMints, 1, 16);

    // Calculate the expected total budget for year 0
    uint256 expectedBudget = (INITIAL_SUPPLY * rate) / 1e18;

    // Perform sequential mints with fuzzed fractions
    for (uint256 i = 0; i < numMints; i++) {
      // Warp to a time within year 0, distributed evenly but still all in year 0
      // Using 364 days to ensure we stay within year 0 (before year 1 starts)
      uint256 timeOffset = ((i + 1) * 364 days) / (numMints + 1);
      vm.warp(deploymentTime + timeOffset);

      uint256 available = nom.mintAvailable();

      // On the last mint, mint everything remaining
      uint256 mintAmount;
      if (i == numMints - 1 && _lastMintIsFull) {
        mintAmount = available;
      } else {
        // Mint a random fraction of available (1-100% bounded to ensure progress)
        // Bound fraction between 1% and 100% of available
        uint256 fraction = bound(_mintFractions[i], 0.01e18, 1e18);
        mintAmount = (available * fraction) / 1e18;

        // Ensure we mint at least 1 if available > 0
        if (available > 0 && mintAmount == 0) {
          mintAmount = 1;
        }
      }

      if (mintAmount > 0) {
        nom.mint(address(0xdead), mintAmount);
        totalMinted += mintAmount;
      }
    }

    if (_lastMintIsFull) {
      assertEq(totalMinted, expectedBudget, "Total minted should equal year 0 budget");
      assertEq(nom.mintAvailable(), 0, "No budget should remain in year 0");
    } else {
      assertLe(totalMinted, expectedBudget, "Total minted should be less than or equal to year 0 budget");
      assertGe(nom.mintAvailable(), 0, "Budget should be greater than or equal to 0 in year 0");
    }
    assertEq(token.balanceOf(address(0xdead)), totalMinted, "Balance should match total minted");
  }

  function test_WhenCrossingYearBoundaries(uint256 _rate, uint256 _year0MintFraction)
    external
    withFuzzedRate(_rate)
    whenCallerIsOwner
  {
    // it demonstrates compounding
    // it shows unused budget is LOST when crossing years
    // it verifies state tracking
    uint256 rate = nom.NOMINAL_ANNUAL_PERCENTAGE_CAP();
    uint256 deploymentTime = nom.DEPLOYMENT_TIME();
    uint256 initialTotalSupply = token.totalSupply();
    uint256 year0MintFraction = bound(_year0MintFraction, 1, 100);

    // Year 0: Mint a random fraction
    uint256 year0Budget = nom.mintAvailable();
    uint256 expectedYear0Budget = (INITIAL_SUPPLY * rate) / 1e18;
    assertEq(year0Budget, expectedYear0Budget);
    assertEq(nom.cachedBudget(), expectedYear0Budget);

    uint256 year0Minted = (year0Budget * year0MintFraction) / 100;
    if (year0Minted > 0) {
      nom.mint(address(0xdead), year0Minted);
    }

    assertEq(token.totalSupply(), initialTotalSupply + year0Minted);
    assertEq(nom.mintAvailable(), year0Budget - year0Minted);
    assertEq(nom.cachedBudget(), year0Budget - year0Minted);

    // Cross into year 1
    vm.warp(deploymentTime + 365 days);

    // Year 1 budget based on current supply (compounding), not year 0 remainder
    uint256 currentSupply = token.totalSupply();
    uint256 year1Budget = nom.mintAvailable();
    uint256 expectedYear1Budget = (currentSupply * rate) / 1e18;
    assertEq(year1Budget, expectedYear1Budget);

    if (year0Minted > 0) {
      assertGt(year1Budget, year0Budget); // Compounding effect
      assertEq(currentSupply, INITIAL_SUPPLY + year0Minted);
    } else {
      assertEq(year1Budget, year0Budget);
    }

    // Mint in year 1 to update state
    vm.expectEmit(true, true, true, false, address(nom));
    emit ICoinIssuer.BudgetReset(1, expectedYear1Budget);
    nom.mint(address(0xdead), 1);
    assertEq(nom.cachedBudgetYear(), 1);
    assertEq(nom.mintAvailable(), expectedYear1Budget - 1);
    assertEq(nom.cachedBudget(), expectedYear1Budget - 1);

    // Jump to year 2
    vm.warp(deploymentTime + 2 * 365 days);
    uint256 year2Budget = nom.mintAvailable();
    uint256 supplyAtYear2 = token.totalSupply();
    assertEq(year2Budget, (supplyAtYear2 * rate) / 1e18);
    assertGt(year2Budget, expectedYear0Budget); // Cumulative compounding
  }

  function test_WhenSkippingYears(uint256 _rate, uint256 _yearsToSkip)
    external
    withFuzzedRate(_rate)
    whenCallerIsOwner
  {
    // it shows that skipping years loses their budgets
    uint256 rate = nom.NOMINAL_ANNUAL_PERCENTAGE_CAP();
    uint256 deploymentTime = nom.DEPLOYMENT_TIME();
    uint256 yearsToSkip = bound(_yearsToSkip, 1, 10);

    uint256 initialBudget = nom.mintAvailable();
    assertEq(nom.cachedBudgetYear(), 0);

    // Mint half of year 0 budget
    nom.mint(address(0xdead), initialBudget / 2);

    // Jump to future year
    vm.warp(deploymentTime + yearsToSkip * 365 days);

    // Budget is only for target year, not accumulated
    uint256 availableAfterSkip = nom.mintAvailable();
    uint256 currentSupply = token.totalSupply();
    assertEq(availableAfterSkip, (currentSupply * rate) / 1e18);
    assertGt(availableAfterSkip, initialBudget); // More due to prior minting

    // Mint triggers year jump
    vm.expectEmit(true, true, true, false, address(nom));
    emit ICoinIssuer.BudgetReset(yearsToSkip, (currentSupply * rate) / 1e18);
    nom.mint(address(0xdead), 1);
    assertEq(nom.cachedBudgetYear(), yearsToSkip);
    assertEq(nom.cachedBudget(), (currentSupply * rate) / 1e18 - 1);

    // Skip more years
    vm.warp(deploymentTime + (yearsToSkip + 4) * 365 days);
    uint256 newSupply = token.totalSupply();
    assertEq(nom.mintAvailable(), (newSupply * rate) / 1e18);
    assertGt(nom.mintAvailable(), initialBudget); // More due to prior minting
  }
}
