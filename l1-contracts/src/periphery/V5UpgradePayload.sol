// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @title V5UpgradePayload
 * @author Aztec Labs
 * @notice Single governance payload that swaps the canonical rollup to v5, the reward
 *         distributor to its v5 replacement, and activates the v5 escape hatch.
 *
 * The v5 rollup contract binds its reward distributor address immutably at construction
 * (see AZIP-2), so changing the distributor requires deploying a new rollup whose
 * constructor was given the new distributor. This payload completes the swap by:
 *
 *  1. `oldDistributor.recover(asset, newDistributor, balance)` — moves the v4 distributor's
 *                                            entire asset balance into the new distributor.
 *  2. `Registry.addRollup(NEW_ROLLUP)`     — makes the v5 rollup canonical.
 *  3. `Registry.updateRewardDistributor`   — points the registry at the new distributor so
 *                                            downstream readers (operator scripts, future
 *                                            rollups, indexers) discover it.
 *  4. `GSE.addRollup(NEW_ROLLUP)`          — registers the v5 rollup with the GSE so attesters
 *                                            can follow it without redepositing.
 *  5. `NEW_ROLLUP.setEscapeHatch(hatch)`   — activates the escape hatch on the v5 rollup, so
 *                                            escape-hatch block production only becomes possible
 *                                            once governance executes this payload. The call is
 *                                            one-shot: it reverts if the rollup's hatch is
 *                                            already set, and the hatch can never be replaced.
 *  6. `oldFlushRewarder.recover(...)`      — only on chains with a flush rewarder wired to the
 *                                            old rollup: moves its available (unowed) rewards
 *                                            into a freshly deployed flush rewarder bound to the
 *                                            v5 rollup, keeping the entry-queue flush incentive
 *                                            alive across the upgrade.
 *
 * The in-service v4 reward distributor exposes the owner-gated, unconstrained
 * `recover(address asset, address to, uint256 amount)`: it transfers exactly `amount` with no
 * drain ceiling, gated on the registry owner (governance). The drain therefore moves the
 * distributor's full balance. The selector is encoded explicitly here because this branch no
 * longer carries an interface for the v4 distributor.
 */
contract V5UpgradePayload is IPayload {
  /// @notice Selector for `recover(address,address,uint256)` on the in-service v4 RewardDistributor.
  /// @dev Hard-coded because the v4 interface is no longer in this repo. The selector is the
  ///      first 4 bytes of `keccak256("recover(address,address,uint256)")`.
  bytes4 public constant LEGACY_RECOVER_SELECTOR = bytes4(keccak256("recover(address,address,uint256)"));

  /// @notice Registry whose canonical pointer and reward-distributor pointer are being updated.
  IRegistry public immutable REGISTRY;

  /// @notice The newly deployed v5 rollup. Already wired to NEW_REWARD_DISTRIBUTOR in its constructor.
  IInstance public immutable NEW_ROLLUP;

  /// @notice The freshly deployed v5 reward distributor; the recipient of the v4 distributor's funds.
  IRewardDistributor public immutable NEW_REWARD_DISTRIBUTOR;

  /// @notice The v4 reward distributor in service before this proposal executes.
  /// @dev Captured at construction by calling `REGISTRY.getRewardDistributor()`, so the address
  ///      tracks whatever the registry currently points to. If the registry pointer changes
  ///      after this payload is deployed and before it is executed, redeploy the payload.
  address public immutable OLD_REWARD_DISTRIBUTOR;

  /// @notice The ERC20 distributed by both the old and new reward distributors.
  IERC20 public immutable ASSET;

  /// @notice The escape hatch this payload activates on NEW_ROLLUP.
  IEscapeHatch public immutable ESCAPE_HATCH;

  /// @notice The flush rewarder serving the old rollup; zero on chains that never wired one.
  FlushRewarder public immutable OLD_FLUSH_REWARDER;

  /// @notice Flush rewarder for the v5 rollup, deployed by this constructor when
  ///         OLD_FLUSH_REWARDER is non-zero; mirrors its reward asset and reward-per-insertion.
  FlushRewarder public immutable NEW_FLUSH_REWARDER;

  error EscapeHatchNotForNewRollup(address expectedRollup, address actualRollup);
  error EscapeHatchAlreadySetOnNewRollup(address existingHatch);

  /**
   * @notice Wire up the payload against a specific v5 rollup, v5 distributor, escape hatch, and
   *         the currently canonical v4 distributor.
   * @dev `Rollup.setEscapeHatch` is one-shot: if governance executes this payload against a
   *      rollup whose hatch slot is already populated, the action reverts and there is no retry.
   *      Both escape-hatch preconditions are therefore checked here, at deploy time, when a
   *      misconfiguration can still be fixed by redeploying.
   * @param _registry             The registry whose pointers will be moved.
   * @param _newRollup            The v5 rollup instance.
   * @param _newRewardDistributor The v5 reward distributor that v5 was constructed with.
   * @param _asset                The ERC20 to drain out of the old distributor.
   * @param _escapeHatch          The escape hatch to activate on the v5 rollup; must point back
   *                              at `_newRollup`.
   * @param _oldFlushRewarder     The flush rewarder serving the old rollup, or zero on chains
   *                              without one.
   */
  constructor(
    IRegistry _registry,
    IInstance _newRollup,
    IRewardDistributor _newRewardDistributor,
    IERC20 _asset,
    IEscapeHatch _escapeHatch,
    FlushRewarder _oldFlushRewarder
  ) {
    address hatchRollup = _escapeHatch.getRollup();
    require(hatchRollup == address(_newRollup), EscapeHatchNotForNewRollup(address(_newRollup), hatchRollup));

    address existingHatch = address(_newRollup.getEscapeHatch());
    require(existingHatch == address(0), EscapeHatchAlreadySetOnNewRollup(existingHatch));

    REGISTRY = _registry;
    NEW_ROLLUP = _newRollup;
    NEW_REWARD_DISTRIBUTOR = _newRewardDistributor;
    ASSET = _asset;
    ESCAPE_HATCH = _escapeHatch;
    OLD_REWARD_DISTRIBUTOR = address(_registry.getRewardDistributor());

    OLD_FLUSH_REWARDER = _oldFlushRewarder;
    NEW_FLUSH_REWARDER = address(_oldFlushRewarder) == address(0)
      ? FlushRewarder(address(0))
      : new FlushRewarder(
        _registry.getGovernance(), _newRollup, _oldFlushRewarder.REWARD_ASSET(), _oldFlushRewarder.rewardPerInsertion()
      );
  }

  /**
   * @notice The actions executed atomically when governance executes this payload: five on
   *         chains without a flush rewarder, six with the flush-rewarder migration appended.
   * @dev The drain moves the v4 distributor's entire asset balance: its `recover` transfers the
   *      requested amount unconditionally. The balance is read at execution time, so the drain
   *      tracks whatever the v4 distributor holds when governance executes — not whatever it had
   *      at proposal time. The flush-rewarder migration likewise reads `rewardsAvailable()` at
   *      execution time, so rewards already owed to flushers are left claimable.
   */
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    bool migrateFlushRewarder = address(OLD_FLUSH_REWARDER) != address(0);
    IPayload.Action[] memory res = new IPayload.Action[](migrateFlushRewarder ? 6 : 5);

    uint256 drainAmount = ASSET.balanceOf(OLD_REWARD_DISTRIBUTOR);

    res[0] = Action({
      target: OLD_REWARD_DISTRIBUTOR,
      data: abi.encodeWithSelector(
        LEGACY_RECOVER_SELECTOR, address(ASSET), address(NEW_REWARD_DISTRIBUTOR), drainAmount
      )
    });

    res[1] = Action({
      target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(NEW_ROLLUP))
    });

    res[2] = Action({
      target: address(REGISTRY),
      data: abi.encodeWithSelector(IRegistry.updateRewardDistributor.selector, address(NEW_REWARD_DISTRIBUTOR))
    });

    res[3] = Action({
      target: address(NEW_ROLLUP.getGSE()),
      data: abi.encodeWithSelector(IGSECore.addRollup.selector, address(NEW_ROLLUP))
    });

    res[4] = Action({
      target: address(NEW_ROLLUP),
      data: abi.encodeWithSelector(IValidatorSelectionCore.setEscapeHatch.selector, address(ESCAPE_HATCH))
    });

    if (migrateFlushRewarder) {
      res[5] = Action({
        target: address(OLD_FLUSH_REWARDER),
        data: abi.encodeWithSelector(
          FlushRewarder.recover.selector,
          address(NEW_FLUSH_REWARDER.REWARD_ASSET()),
          address(NEW_FLUSH_REWARDER),
          OLD_FLUSH_REWARDER.rewardsAvailable()
        )
      });
    }

    return res;
  }

  function getURI() external pure override(IPayload) returns (string memory) {
    return "https://github.com/AztecProtocol/aztec-packages/pull/23752";
  }
}
