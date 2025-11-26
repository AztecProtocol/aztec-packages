// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ICoinIssuer} from "@aztec/governance/interfaces/ICoinIssuer.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Ownable2Step} from "@oz/access/Ownable2Step.sol";

/**
 * @title CoinIssuer
 * @author Aztec Labs
 * @notice A contract that allows minting of coins at a maximum percentage rate per year using discrete annual budgets
 *
 * This contract uses a discrete annual budget model:
 * - Years are fixed periods from deployment:
 *   - year 0 = [deployment, deployment + 365d)
 *   - year 1 = [deployment + 365d, deployment + (2) * 365d)
 *   - ...
 *   - year n = [deployment + 365d * n, deployment + (n + 1) * 365d)
 * - Each year's budget is calculated at the start of that year based on the actual supply at that moment
 * - Budget = totalSupply() × NOMINAL_ANNUAL_PERCENTAGE_CAP / 1e18
 * - Unused budget from year N is LOST when year N+1 begins (use-it-or-lose-it)
 *
 * Rate semantics: If the full budget is minted every year, the effective annual inflation rate equals
 * NOMINAL_ANNUAL_PERCENTAGE_CAP. For example, setting the rate to 0.10e18 (10%) and fully minting each
 * year will result in supply growing by exactly 10% annually: supply(year N) = supply(year 0) × (1.10)^N
 *
 * Partial minting: If less than the full budget is minted in year N, the remaining allowance is lost
 * at the year N→N+1 boundary. Year N+1's budget is calculated based on the actual supply at the start
 * of year N+1, which reflects only what was actually minted.
 *
 * @dev The NOMINAL_ANNUAL_PERCENTAGE_CAP is in e18 precision where 1e18 = 100%
 *      Note that values larger than 100% are accepted
 *
 * @dev The token MUST have a non-zero initial supply at deployment, or an alternative way to mint the token.
 *      If it has alternative ways to mint, these can bypass the budget.
 *
 * @dev The `CoinIssuer` must be a minter of the `ASSET`. e.g.,  through a specified role, or by being the owner,
 *      or some other means.
 *
 * @dev The `CoinIssuer` is limited to a single asset, if you need more, consider deploying multiple `CoinIssuer`s
 *      or use a different setup.
 *
 * @dev Beware that the `CoinIssuer` might behave unexpected if the `ASSET` is a "weird" ERC20, e.g., fee-on-mint
 *      and fee-on-transfer or rebasing assets. Also manipulation of `totalSupply` outside of the `mint` function
 *      might have unexpected implications.
 */
contract CoinIssuer is ICoinIssuer, Ownable {
  IMintableERC20 public immutable ASSET;
  uint256 public immutable NOMINAL_ANNUAL_PERCENTAGE_CAP;
  uint256 public immutable DEPLOYMENT_TIME;

  // Note that the state variables below are "cached":
  // they are only updated when minting after a year boundary.
  uint256 public cachedBudgetYear;
  uint256 public cachedBudget;

  constructor(IMintableERC20 _asset, uint256 _annualPercentage, address _owner) Ownable(_owner) {
    ASSET = _asset;
    NOMINAL_ANNUAL_PERCENTAGE_CAP = _annualPercentage;
    DEPLOYMENT_TIME = block.timestamp;

    cachedBudgetYear = 0;
    cachedBudget = _getNewBudget();

    // If the budget is 0, it is likely a misconfiguration with tiny _annualPercentage or lack of initial supply
    require(cachedBudget > 0, Errors.CoinIssuer__InvalidConfiguration());

    emit BudgetReset(0, cachedBudget);
  }

  function acceptTokenOwnership() external override(ICoinIssuer) onlyOwner {
    Ownable2Step(address(ASSET)).acceptOwnership();
  }

  /**
   * @notice  Mint `_amount` tokens to `_to`
   *
   * @dev     The `_amount` must be within the `cachedBudget`
   *
   * @param _to - The address to receive the funds
   * @param _amount - The amount to mint
   */
  function mint(address _to, uint256 _amount) external override(ICoinIssuer) onlyOwner {
    // Update state if we've crossed into a new year (will reset budget and forfeit unused amount)
    _updateBudgetIfNeeded();

    uint256 budget = cachedBudget;

    require(_amount <= budget, Errors.CoinIssuer__InsufficientMintAvailable(budget, _amount));
    cachedBudget = budget - _amount;

    ASSET.mint(_to, _amount);
  }

  /**
   * @notice  The amount of funds that is available for "minting" in the current year
   *          If we've crossed into a new year since the last mint, returns the fresh budget
   *          for the new year based on current supply.
   *
   * @return The amount mintable
   */
  function mintAvailable() public view override(ICoinIssuer) returns (uint256) {
    uint256 currentYear = _yearSinceGenesis();

    // Until the budget is stale, return the cached budget
    if (cachedBudgetYear >= currentYear) {
      return cachedBudget;
    }

    // Crossed into new year(s): compute fresh budget
    return _getNewBudget();
  }

  /**
   * @notice  Internal function to update year and budget when crossing year boundaries
   *
   * @dev     If multiple years have passed without minting, jumps directly to current year
   *          and all intermediate years' budgets are lost
   */
  function _updateBudgetIfNeeded() private {
    uint256 currentYear = _yearSinceGenesis();
    // If the budget is for the past, update the budget.
    if (cachedBudgetYear < currentYear) {
      cachedBudgetYear = currentYear;
      cachedBudget = _getNewBudget();

      emit BudgetReset(currentYear, cachedBudget);
    }
  }

  /**
   * @notice  Internal function to compute the current year since genesis
   */
  function _yearSinceGenesis() private view returns (uint256) {
    return (block.timestamp - DEPLOYMENT_TIME) / 365 days;
  }

  /**
   * @notice  Internal function to compute a fresh budget
   */
  function _getNewBudget() private view returns (uint256) {
    return ASSET.totalSupply() * NOMINAL_ANNUAL_PERCENTAGE_CAP / 1e18;
  }
}
