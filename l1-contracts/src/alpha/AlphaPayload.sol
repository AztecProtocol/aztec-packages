// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IGovernance, Configuration} from "@aztec/governance/Governance.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @title AlphaPayload
 * @notice Governance payload for the alpha rollup cutover.
 * @dev The payload performs six actions in order:
 * 1. Register the new rollup in the Registry (making it canonical).
 * 2. Register the new rollup in the GSE so following stakers are moved.
 * 3. Enable rewards claiming on the new rollup.
 * 4. Update the rollup escape hatch to the newly deployed escape hatch contract.
 * 5. Move currently claimable rewards from the old flush rewarder to the new flush rewarder.
 * 6. Update Governance configuration so `executionDelay` is set to 30 days.
 *
 * The new flush rewarder is deployed in the constructor and mirrors the old rewarder's
 * reward asset and reward-per-insertion settings.
 */
contract AlphaPayload is IPayload {
  /// @notice Registry where the new rollup version is added.
  IRegistry public immutable REGISTRY;

  /// @notice Governance contract controlling execution of this payload.
  IGovernance public immutable GOVERNANCE;

  /// @notice New rollup instance to register and promote.
  IInstance public immutable ROLLUP;

  /// @notice Reward token used by both old and new flush rewarders.
  IERC20 public immutable REWARD_ASSET;

  /// @notice Existing flush rewarder holding rewards to migrate.
  FlushRewarder public immutable OLD_FLUSH_REWARDER;

  /// @notice Newly deployed flush rewarder for the new rollup.
  FlushRewarder public immutable NEW_FLUSH_REWARDER;

  /// @notice Newly deployed escape hatch contract for the new rollup.
  IEscapeHatch public immutable ESCAPE_HATCH;

  /**
   * @notice Constructs the alpha governance payload.
   * @param _registry Registry containing canonical rollup and governance addresses.
   * @param _rollup New rollup instance to register.
   * @param _oldFlushRewarder Existing rewarder from which rewards are recovered.
   * @param _escapeHatch Escape hatch contract to be activated on the new rollup.
   */
  constructor(IRegistry _registry, IInstance _rollup, FlushRewarder _oldFlushRewarder, IEscapeHatch _escapeHatch) {
    REGISTRY = _registry;
    GOVERNANCE = IGovernance(REGISTRY.getGovernance());

    ROLLUP = _rollup;
    OLD_FLUSH_REWARDER = _oldFlushRewarder;
    ESCAPE_HATCH = _escapeHatch;

    REWARD_ASSET = OLD_FLUSH_REWARDER.REWARD_ASSET();

    NEW_FLUSH_REWARDER =
      new FlushRewarder(address(GOVERNANCE), ROLLUP, REWARD_ASSET, OLD_FLUSH_REWARDER.rewardPerInsertion());
  }

  /**
   * @notice Returns the exact action list executed by governance.
   * @return - The array of actions to execute, in order:
   * 0. Registry.addRollup(new rollup)
   * 1. GSE.addRollup(new rollup)
   * 2. Rollup.setRewardsClaimable(true)
   * 3. Rollup.updateEscapeHatch(new escape hatch)
   * 4. oldRewarder.recover(reward asset, new rewarder, rewardsAvailable)
   * 5. Governance.updateConfiguration(executionDelay = 30 days)
   */
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](6);

    res[0] =
      Action({target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(ROLLUP))});

    res[1] = Action({
      target: address(ROLLUP.getGSE()), data: abi.encodeWithSelector(IGSECore.addRollup.selector, address(ROLLUP))
    });

    res[2] =
      Action({target: address(ROLLUP), data: abi.encodeWithSelector(IRollupCore.setRewardsClaimable.selector, true)});

    // Note: Adding the escape hatch here ensures that only when the payload is executed will it be possible
    // to produce blocks this way.
    res[3] = Action({
      target: address(ROLLUP),
      data: abi.encodeWithSelector(IValidatorSelectionCore.updateEscapeHatch.selector, address(ESCAPE_HATCH))
    });

    // Note: rewardsAvailable() is called at execution time to recover all assets that are not owed to anyone at that
    // time. This ensures that rewards that can be claimed by users won't be swept.
    uint256 fundsToMove = OLD_FLUSH_REWARDER.rewardsAvailable();
    res[4] = Action({
      target: address(OLD_FLUSH_REWARDER),
      data: abi.encodeWithSelector(
        FlushRewarder.recover.selector, address(REWARD_ASSET), address(NEW_FLUSH_REWARDER), fundsToMove
      )
    });

    Configuration memory config = GOVERNANCE.getConfiguration();
    config.executionDelay = Timestamp.wrap(30 days);

    res[5] = Action({
      target: address(GOVERNANCE), data: abi.encodeWithSelector(IGovernance.updateConfiguration.selector, config)
    });

    return res;
  }

  /**
   * @notice Returns the URI describing this payload
   * @return The payload URI string
   */
  function getURI() external pure override(IPayload) returns (string memory) {
    return "https://github.com/AztecProtocol/aztec-packages/pull/20865";
  }
}
