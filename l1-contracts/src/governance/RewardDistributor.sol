// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RewardDistributor
 * @notice Holds ASSET and makes it claimable by the canonical rollup, with optional per-address earmarking.
 *
 * Any address may be specifically funded via `subsidizeAddress`. ASSETs transferred to this contract
 * directly (not via `subsidizeAddress`) form an implicit pool that is claimable only by the
 * presently canonical rollup, in addition to whatever has been earmarked to it.
 *
 * Rollups are not privileged at the bookkeeping layer: the only place the concept of "rollup"
 * enters is that the canonical rollup is the sole address with access to the implicit pool.
 * Earmarked balances are tracked per arbitrary address.
 *
 * Governance may recover all funds, earmarked or otherwise.
 *
 * NOTE: This is intended to be used with the $AZTEC token (0xa27ec0006e59f245217ff08cd52a7e8b169e62d2)
 * or at least a standard, ERC-20 token that does not have any fee-on-transfer or rebasing.
 */
contract RewardDistributor is IRewardDistributor {
  using SafeERC20 for IERC20;

  /// @notice The ERC-20 token distributed by this contract.
  IERC20 public immutable ASSET;
  /// @notice The registry consulted to resolve the canonical rollup and the governance owner.
  IRegistry public immutable REGISTRY;

  /// @notice Earmarked ASSET balance per recipient.
  /// @dev ASSET sent directly to this contract (not via `subsidizeAddress`) is *not* recorded
  ///      here; it forms the implicit pool available to the canonical rollup.
  mapping(address recipient => uint256 amount) public specificRecipientBalance;

  /// @notice The sum of `specificRecipientBalance` across all recipients.
  uint256 public totalEarmarkedBalance;

  /**
   * @notice Bind this distributor to a specific ASSET and registry.
   * @param _asset    The ERC-20 token this contract will hold and distribute.
   * @param _registry The registry used to look up the canonical rollup and governance owner.
   */
  constructor(IERC20 _asset, IRegistry _registry) {
    ASSET = _asset;
    REGISTRY = _registry;
  }

  /**
   * @notice Transfer funds from msg.sender and earmark them for `_recipient`.
   * @dev No validation is made that `_recipient` is a rollup or registered with the registry.
   *      This allows rollups that have not been registered yet to receive funds, or even a
   *      contract that is not a rollup at all to be funded through this contract. Rollups are
   *      not privileged here; the only place "rollup" matters is that the canonical rollup
   *      additionally has access to the implicit (un-earmarked) pool via `claim`.
   * @param _recipient The address to earmark claimable funds to. Must be non-zero.
   * @param _amount    The amount of ASSET to pull from msg.sender.
   */
  function subsidizeAddress(address _recipient, uint256 _amount) external override(IRewardDistributor) {
    require(_recipient != address(0), Errors.RewardDistributor__ZeroRollup());
    specificRecipientBalance[_recipient] += _amount;
    totalEarmarkedBalance += _amount;
    ASSET.safeTransferFrom(msg.sender, address(this), _amount);
    emit Subsidized(msg.sender, _recipient, _amount);
  }

  /**
   * @notice Claim funds available to the caller.
   * @dev When the caller is the canonical rollup it can draw from both the implicit pool
   *      (un-earmarked ASSET held by this contract) and any balance earmarked to it. For any
   *      other caller only its earmarked balance is available.
   * @param _to     The address that receives the transferred ASSET.
   * @param _amount The amount of ASSET to transfer.
   */
  function claim(address _to, uint256 _amount) external override(IRewardDistributor) {
    _transfer(msg.sender, _to, _amount);
  }

  /**
   * @notice Governance-only recovery of ASSET held by this contract.
   * @dev Same accounting rules as `claim`: when `_from` is the canonical rollup the implicit
   *      pool is drawn from first, otherwise only `_from`'s earmarked balance is available.
   *      The function selector differs from the pre-existing `recover(address,address,uint256)`
   *      only in parameter naming, so this signature is intentionally renamed to avoid silently
   *      hijacking call sites that targeted the older shape.
   * @param _from   The address whose accounting bucket the funds are drawn from.
   * @param _to     The recipient of the recovered ASSET.
   * @param _amount The amount of ASSET to transfer.
   */
  function recoverFrom(address _from, address _to, uint256 _amount) external override(IRewardDistributor) {
    address owner = Ownable(address(REGISTRY)).owner();
    require(msg.sender == owner, Errors.RewardDistributor__InvalidCaller(msg.sender, owner));
    _transfer(_from, _to, _amount);
  }

  /**
   * @notice Governance-only recovery of tokens other than ASSET that ended up in this contract.
   * @dev Refuses ASSET so the ASSET accounting (implicit pool + earmarked balances) cannot be
   *      bypassed. Use `recoverFrom` for ASSET.
   * @param _asset  The ERC-20 token to transfer; must not equal `ASSET`.
   * @param _to     The recipient of the transferred tokens.
   * @param _amount The amount to transfer.
   */
  function recoverWrongAsset(address _asset, address _to, uint256 _amount) external override(IRewardDistributor) {
    address owner = Ownable(address(REGISTRY)).owner();
    require(msg.sender == owner, Errors.RewardDistributor__InvalidCaller(msg.sender, owner));
    require(_asset != address(ASSET), Errors.RewardDistributor__WrongRecoverMechanism());
    IERC20(_asset).safeTransfer(_to, _amount);
  }

  /**
   * @notice Returns the ASSET amount that `_recipient` can currently `claim`.
   * @dev The canonical rollup sees the implicit pool plus its own earmarked balance; any other
   *      address sees only its earmarked balance.
   * @param _recipient The address to query the available balance for.
   * @return The amount of ASSET `_recipient` can claim right now.
   */
  function availableTo(address _recipient) public view override(IRewardDistributor) returns (uint256) {
    address canonical = canonicalRollup();
    uint256 claimableAsCanonical = _recipient == canonical ? ASSET.balanceOf(address(this)) - totalEarmarkedBalance : 0;
    return claimableAsCanonical + specificRecipientBalance[_recipient];
  }

  /**
   * @notice Returns the address currently registered as the canonical rollup in the registry.
   * @return The canonical rollup address; this is the only address with access to the implicit pool.
   */
  function canonicalRollup() public view override(IRewardDistributor) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }

  /**
   * @notice Shared accounting path for `claim` and `recoverFrom`.
   * @dev When `_from` is the canonical rollup, the implicit (un-earmarked) pool is consumed
   *      first; any shortfall is drawn from `_from`'s earmarked balance. For non-canonical
   *      `_from`, only its earmarked balance is available.
   * @param _from   The accounting bucket to draw funds from.
   * @param _to     The recipient of the transferred ASSET.
   * @param _amount The amount of ASSET to transfer.
   */
  function _transfer(address _from, address _to, uint256 _amount) internal {
    address canonical = canonicalRollup();
    uint256 claimableAsCanonical = _from == canonical ? ASSET.balanceOf(address(this)) - totalEarmarkedBalance : 0;

    // This is the standard case, so avoid SLOAD if we can
    if (_amount <= claimableAsCanonical) {
      ASSET.safeTransfer(_to, _amount);
      emit Distributed(_from, _to, _amount, _amount, 0);
      return;
    }

    // Canonical balance couldn't cover the requested amount,
    // see if we can get there with funds earmarked for this address.
    uint256 earmarked = specificRecipientBalance[_from];
    uint256 totalAvailable = claimableAsCanonical + earmarked;
    require(totalAvailable >= _amount, Errors.RewardDistributor__InsufficientAvailable(_amount, totalAvailable));

    // Reduce this address's earmarked funds and totalEarmarkedBalance since we know we drew from it.
    // Effectively, we draw from the canonical/implicit pool first.
    uint256 earmarkedFundsUsed = _amount - claimableAsCanonical;
    specificRecipientBalance[_from] -= earmarkedFundsUsed;
    totalEarmarkedBalance -= earmarkedFundsUsed;
    ASSET.safeTransfer(_to, _amount);
    emit Distributed(_from, _to, _amount, claimableAsCanonical, earmarkedFundsUsed);
  }
}
