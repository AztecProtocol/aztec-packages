// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/**
 * @title IZeroRegistryRewardsPayload
 * @author Aztec Labs
 * @notice The payload's own surface beside {IPayload}. Declared so that every external method overrides a
 *         definition, which is what `src/` is linted for.
 */
interface IZeroRegistryRewardsPayload is IPayload {
  /// @notice How many registries the payload zeroes
  /// @return The number of listed registries
  function registryCount() external view returns (uint256);
}

/**
 * @title ZeroRegistryRewardsPayload
 * @author Aztec Labs
 * @notice Installs a {RegistryReductionCalculator} on a rollup and sets the sequencer checkpoint reward to zero for
 *         validators staked through an ATP of any listed registry.
 *
 * @dev The actions, in order, are one `setRegistryReward(registry, 0)` per listed registry followed by
 *      `setSequencerRewardCalculator(calculator)` on the rollup.
 *
 *      The calculator is deployed by this payload's constructor. Its owner is the rollup's owner and its GSE is the
 *      rollup's GSE, both read from the rollup rather than taken as arguments, so the deployer never holds owner
 *      rights over the calculator and the only entries it can carry are the ones these actions write. The rollup
 *      does not consult the calculator until the final action, and the actions execute atomically. An unconfigured
 *      calculator returns the default reward for every proposer.
 *
 *      Registries that are not listed have no entry, and their validators receive the default reward. The list is
 *      fixed at construction and can be read from {registries}.
 *
 *      The rollup's owner keeps ownership of the calculator and can change or remove an entry later without
 *      deploying anything. `RegistryReductionCalculator` caps every entry at the default reward when it is read, so
 *      no configuration of it pays a validator more than the default.
 */
contract ZeroRegistryRewardsPayload is IZeroRegistryRewardsPayload {
  /// @dev The reward set for every listed registry.
  uint96 internal constant NO_REWARD = 0;

  /// @notice The rollup that will consult the calculator.
  IInstance public immutable ROLLUP;

  /// @notice The calculator deployed by this payload, owned by the rollup's owner.
  RegistryReductionCalculator public immutable CALCULATOR;

  /// @notice The ATP registries set to a zero reward. Fixed at construction.
  address[] public registries;

  error ZeroRegistryRewardsPayload__DuplicateRegistry(address registry);
  error ZeroRegistryRewardsPayload__NoRegistries();
  error ZeroRegistryRewardsPayload__ZeroAddress();

  /**
   * @param _rollup The rollup to install the calculator on; its owner becomes the calculator's owner and its GSE
   *        the one the calculator resolves withdrawers against
   * @param _registries The ATP registries to zero, at least one, without duplicates
   */
  constructor(IInstance _rollup, address[] memory _registries) {
    require(address(_rollup) != address(0), ZeroRegistryRewardsPayload__ZeroAddress());
    require(_registries.length > 0, ZeroRegistryRewardsPayload__NoRegistries());

    for (uint256 i = 0; i < _registries.length; i++) {
      require(_registries[i] != address(0), ZeroRegistryRewardsPayload__ZeroAddress());
      // Each registry appears once, so the actions map one-to-one onto {registries}.
      for (uint256 j = 0; j < i; j++) {
        require(_registries[i] != _registries[j], ZeroRegistryRewardsPayload__DuplicateRegistry(_registries[i]));
      }
      registries.push(_registries[i]);
    }

    ROLLUP = _rollup;
    CALCULATOR = new RegistryReductionCalculator(_rollup.getGSE(), Ownable(address(_rollup)).owner());
  }

  /// @notice How many registries this payload zeroes.
  function registryCount() external view override(IZeroRegistryRewardsPayload) returns (uint256) {
    return registries.length;
  }

  /// @inheritdoc IPayload
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    uint256 count = registries.length;
    IPayload.Action[] memory actions = new IPayload.Action[](count + 1);

    for (uint256 i = 0; i < count; i++) {
      actions[i] = IPayload.Action({
        target: address(CALCULATOR),
        data: abi.encodeCall(RegistryReductionCalculator.setRegistryReward, (registries[i], NO_REWARD))
      });
    }

    actions[count] = IPayload.Action({
      target: address(ROLLUP), data: abi.encodeCall(IRollupCore.setSequencerRewardCalculator, (address(CALCULATOR)))
    });

    return actions;
  }

  /// @inheritdoc IPayload
  function getURI() external pure override(IPayload) returns (string memory) {
    return "ZeroRegistryRewardsPayload";
  }
}
