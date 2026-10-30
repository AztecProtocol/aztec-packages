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
 * @notice Stops paying a sequencer checkpoint reward to validators staked through an ATP of any listed registry.
 *
 * @dev Stake that cannot be sold, lent or deployed elsewhere has no opportunity cost, so it stakes at any positive
 *      reward. The checkpoint reward pool is fixed in absolute terms, so such stake dilutes every other validator
 *      while the reward buys no retention from a holder who could not sell in the first place. This pays it nothing.
 *
 *      The actions, in order, are one `setRegistryReward(registry, 0)` per listed registry followed by
 *      `setSequencerRewardCalculator(calculator)` on the rollup.
 *
 *      The calculator is deployed by this payload's constructor and owned by the rollup's owner (governance) from
 *      that moment, so the configuring calls are the owner's own and the reward values are visible in the proposal
 *      rather than in a deployed contract's storage. The owner and the GSE are read from the rollup rather than
 *      taken as arguments: a deployer who could name the owner could name itself, write entries the list does not
 *      show, and transfer the calculator to governance before the vote. The calculator is not consulted by the
 *      rollup until the final action, and the
 *      actions execute atomically, so the window in which it exists unconfigured pays nobody anything different:
 *      an unconfigured calculator returns the default for every proposer.
 *
 *      Only the listed registries are configured. Every other ATP registry is left without an entry and its
 *      validators keep the default reward. The list is fixed at construction and is the whole of the policy, so a
 *      reviewer reads it off this contract and is done.
 *
 *      Governance keeps ownership of the calculator, so a later proposal can retune or remove an entry without
 *      deploying anything. `RegistryReductionCalculator` caps every entry at the default when it is read, so no
 *      configuration of it can ever pay a validator more than it would have earned without it.
 */
contract ZeroRegistryRewardsPayload is IZeroRegistryRewardsPayload {
  /// @dev What a checkpoint proposed by a listed registry's validator earns.
  uint96 internal constant NO_REWARD = 0;

  /// @notice The rollup that will consult the calculator.
  IInstance public immutable ROLLUP;

  /// @notice The calculator deployed by this payload, owned by the rollup's owner.
  RegistryReductionCalculator public immutable CALCULATOR;

  /// @notice The ATP registries whose validators earn nothing. Fixed at construction.
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
      // A repeated entry would make the proposal claim more reach than it has.
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
