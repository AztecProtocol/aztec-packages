// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IATP} from "@test/reward-calculators/IATP.sol";
import {IPremiumATP} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATPRegistry} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";

/**
 * @title PremiumATP
 * @author Aztec Labs
 * @notice A premium-eligible Aztec Token Position (ATP): an allocation of tokens that unlocks on its registry's
 *         schedule, of which the part staked through its staker stays reserved until the operator releases it.
 *
 * @dev Invariant: `claimed + reserved <= allocation`. `reserveForStake` (staker only) refuses to reserve beyond
 *      `allocation - claimed`; `claim` pays at most `allocation - claimed - reserved`, and also at most what the
 *      schedule has unlocked and what the position holds. So the beneficiary never receives more than
 *      `allocation - reserved` in total, whatever else is sent to the position: tokens beyond the allocation
 *      (top-ups, donations, the excess of a front-run deposit) never raise that bound. They are not kept apart
 *      either: once a slash leaves the balance short of what the schedule and the reservation allow, such tokens
 *      fill the hole and can be claimed, still within `allocation - claimed - reserved`. There is no sweep: stake
 *      returning from the rollup lands here and stays under the schedule and the reservation.
 *
 *      Positions are EIP-1167 clones of one implementation, created and initialized by the factory in one
 *      transaction. Only the factory that deployed the implementation can initialize a clone, once; the
 *      implementation itself is marked initialized at construction. The registry and token are immutables of the
 *      implementation, so a clone of it made by anyone else answers `getRegistry()` like a genuine position: a
 *      calculator must authenticate positions with the factory's `isATP`, not with the registry.
 */
contract PremiumATP is IPremiumATP {
  using SafeERC20 for IERC20;

  address internal immutable FACTORY;
  PremiumATPRegistry internal immutable REGISTRY;
  IERC20 internal immutable TOKEN;
  address internal immutable STAKER_IMPLEMENTATION;

  address internal beneficiary;
  address internal operator;
  address internal staker;
  uint256 internal allocation;
  uint256 internal claimed;
  uint256 internal reserved;

  /**
   * @notice Emitted when the position creates its staker
   * @param staker The staker
   */
  event StakerCreated(address indexed staker);

  /**
   * @notice Emitted when the beneficiary changes the operator
   * @param operator The new operator
   */
  event OperatorUpdated(address indexed operator);

  /**
   * @notice Emitted when the beneficiary claims
   * @param amount The amount claimed
   */
  event Claimed(uint256 amount);

  /**
   * @notice Emitted when the staker reserves part of the allocation
   * @param amount The amount reserved
   */
  event Reserved(uint256 amount);

  /**
   * @notice Emitted when the staker frees part of the reservation
   * @param amount The amount freed
   */
  event ReservationReleased(uint256 amount);

  error PremiumATP__NotFactory(address caller);
  error PremiumATP__AlreadyInitialized();
  error PremiumATP__ZeroBeneficiary();
  error PremiumATP__ZeroAllocation();
  error PremiumATP__NotBeneficiary(address caller);
  error PremiumATP__NotStaker(address caller);
  error PremiumATP__NothingToClaim();
  error PremiumATP__AllocationExhausted(uint256 available, uint256 requested);

  modifier onlyBeneficiary() {
    require(msg.sender == beneficiary, PremiumATP__NotBeneficiary(msg.sender));
    _;
  }

  modifier onlyStaker() {
    require(msg.sender == staker, PremiumATP__NotStaker(msg.sender));
    _;
  }

  /**
   * @dev Deployed by the factory, which becomes the only account allowed to initialize clones of this
   *      implementation.
   * @param _registry The registry every position reports and follows the schedule of
   * @param _token The token of the allocation
   * @param _stakerImplementation The staker implementation every position clones
   */
  constructor(PremiumATPRegistry _registry, IERC20 _token, address _stakerImplementation) {
    FACTORY = msg.sender;
    REGISTRY = _registry;
    TOKEN = _token;
    STAKER_IMPLEMENTATION = _stakerImplementation;
    staker = address(0xdead);
  }

  /**
   * @notice Initializes a position and creates its staker
   * @dev Only the factory, once. The factory funds the position in the same transaction.
   * @param _beneficiary The beneficiary
   * @param _allocation The allocation
   */
  function initialize(address _beneficiary, uint256 _allocation) external {
    require(msg.sender == FACTORY, PremiumATP__NotFactory(msg.sender));
    require(staker == address(0), PremiumATP__AlreadyInitialized());
    require(_beneficiary != address(0), PremiumATP__ZeroBeneficiary());
    require(_allocation > 0, PremiumATP__ZeroAllocation());

    beneficiary = _beneficiary;
    allocation = _allocation;

    address newStaker = Clones.clone(STAKER_IMPLEMENTATION);
    staker = newStaker;
    PremiumATPStaker(newStaker).initialize();
    emit StakerCreated(newStaker);
  }

  /**
   * @notice Sets the operator allowed to stake, exit and release through the staker
   * @dev Only the beneficiary.
   * @param _operator The new operator, zero to disable staking
   */
  function updateStakerOperator(address _operator) external onlyBeneficiary {
    operator = _operator;
    emit OperatorUpdated(_operator);
  }

  /**
   * @notice Sends the claimable amount to the beneficiary
   * @dev Only the beneficiary. Reverts if nothing is claimable.
   * @return amount The amount claimed
   */
  function claim() external onlyBeneficiary returns (uint256 amount) {
    amount = getClaimable();
    require(amount > 0, PremiumATP__NothingToClaim());
    claimed += amount;
    TOKEN.safeTransfer(beneficiary, amount);
    emit Claimed(amount);
  }

  /**
   * @inheritdoc IPremiumATP
   */
  function reserveForStake(uint256 _amount) external override(IPremiumATP) onlyStaker {
    uint256 available = allocation - claimed - reserved;
    require(_amount <= available, PremiumATP__AllocationExhausted(available, _amount));
    reserved += _amount;
    TOKEN.safeTransfer(staker, _amount);
    emit Reserved(_amount);
  }

  /**
   * @inheritdoc IPremiumATP
   */
  function releaseReservation(uint256 _amount) external override(IPremiumATP) onlyStaker {
    reserved -= _amount;
    emit ReservationReleased(_amount);
  }

  /**
   * @notice Returns what `claim` would pay now
   * @return The minimum of the unlocked and unclaimed amount, the unreserved allocation, and the balance
   */
  function getClaimable() public view returns (uint256) {
    uint256 unlocked = REGISTRY.unlockedAt(allocation, block.timestamp);
    uint256 byLock = unlocked > claimed ? unlocked - claimed : 0;
    uint256 byReservation = allocation - claimed - reserved;
    return Math.min(Math.min(byLock, byReservation), TOKEN.balanceOf(address(this)));
  }

  /**
   * @notice Returns the registry of the position
   * @return The registry address
   */
  function getRegistry() external view override(IATP) returns (address) {
    return address(REGISTRY);
  }

  /**
   * @inheritdoc IPremiumATP
   */
  function getStaker() external view override(IPremiumATP) returns (address) {
    return staker;
  }

  /**
   * @inheritdoc IPremiumATP
   */
  function getOperator() external view override(IPremiumATP) returns (address) {
    return operator;
  }

  /**
   * @notice Returns the factory allowed to initialize positions of this implementation
   * @return The factory address
   */
  function getFactory() external view returns (address) {
    return FACTORY;
  }

  /**
   * @notice Returns the beneficiary
   * @return The beneficiary address
   */
  function getBeneficiary() external view returns (address) {
    return beneficiary;
  }

  /**
   * @notice Returns the token of the allocation
   * @return The token
   */
  function getToken() external view returns (IERC20) {
    return TOKEN;
  }

  /**
   * @notice Returns the allocation
   * @return The allocation
   */
  function getAllocation() external view returns (uint256) {
    return allocation;
  }

  /**
   * @notice Returns the total claimed so far
   * @return The claimed amount
   */
  function getClaimed() external view returns (uint256) {
    return claimed;
  }

  /**
   * @notice Returns the part of the allocation reserved for recorded attesters
   * @return The reserved amount
   */
  function getReserved() external view returns (uint256) {
    return reserved;
  }
}
