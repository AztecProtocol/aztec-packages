// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {ProbeLib} from "@test/reward-calculators/ProbeLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Math} from "@oz/utils/math/Math.sol";

/**
 * @title RegistryReductionCalculator
 * @author Aztec Labs
 * @notice Reference sequencer reward calculator that pays a reduced reward to validators staked through an Aztec
 *         Token Position (ATP) of an owner-configured registry, and the default to everyone else.
 *
 * @dev A proposer resolves to a registry as `GSE.getWithdrawer(attester).getATP().getRegistry()`: ATP stakers
 *      register themselves as the GSE withdrawer, the staker exposes its ATP and the ATP the registry it was created
 *      from. Both hops are bounded probes (`ProbeLib`), so a withdrawer cannot make the calculator revert or spend
 *      more than `PROBE_GAS` per hop; any failed probe pays the default.
 *
 *      Nothing in the lookup is authenticated: a validator can deploy a withdrawer that points at any registry. This
 *      is safe only because the calculator never pays more than the default, so claiming membership of a configured
 *      registry can only lower one's own reward. Entries are capped at read time, `min(default, entry)`, so lowering
 *      the default through `setRewardConfig` can never turn an entry into a premium. A calculator that pays premiums
 *      needs authenticated lookups.
 *
 *      The calculator does not trust `msg.sender` for anything and reads only the GSE, which is shared by every
 *      rollup version. Lookups reflect state when the proof lands. Per call, each distinct proposer is resolved once
 *      and the result is cached in memory per attester.
 */
contract RegistryReductionCalculator is Ownable, ISequencerRewardCalculator {
  struct Entry {
    bool exists;
    uint96 sequencerReward;
  }

  /// @notice Gas forwarded to each probe.
  /// @dev A withdrawer can make both probes burn their whole stipend, so the worst case per distinct proposer is one
  ///      GSE read plus two full stipends, which must fit `CALCULATOR_GAS_PER_CHECKPOINT`. Mainnet ATP hops cost
  ///      well under this (ERC1967 proxy or EIP-1167 clone delegation and at most two storage reads).
  uint256 public constant PROBE_GAS = 20_000;

  /// @notice The GSE whose withdrawers are resolved.
  IGSE public immutable GSE;

  mapping(address registry => Entry entry) internal entries;

  /**
   * @notice Emitted when a registry's reward is set
   * @param registry The ATP registry
   * @param sequencerReward The sequencer reward per checkpoint, capped at the default when paid
   */
  event RegistryRewardSet(address indexed registry, uint96 sequencerReward);

  /**
   * @notice Emitted when a registry's reward is removed
   * @param registry The ATP registry
   */
  event RegistryRewardRemoved(address indexed registry);

  error RegistryReductionCalculator__InvalidGSE(address gse);
  error RegistryReductionCalculator__ZeroRegistry();
  error RegistryReductionCalculator__UnknownRegistry(address registry);

  /**
   * @param _gse The GSE whose withdrawers are resolved
   * @param _owner The owner allowed to configure registry rewards (Governance)
   */
  constructor(IGSE _gse, address _owner) Ownable(_owner) {
    require(address(_gse).code.length > 0, RegistryReductionCalculator__InvalidGSE(address(_gse)));
    GSE = _gse;
  }

  /**
   * @notice Sets the sequencer reward of validators staked through ATPs of `_registry`
   * @dev Zero is a valid reward. A reward at or above the default pays the default.
   * @param _registry The ATP registry, not zero
   * @param _sequencerReward The sequencer reward per checkpoint
   */
  function setRegistryReward(address _registry, uint96 _sequencerReward) external onlyOwner {
    require(_registry != address(0), RegistryReductionCalculator__ZeroRegistry());
    entries[_registry] = Entry({exists: true, sequencerReward: _sequencerReward});
    emit RegistryRewardSet(_registry, _sequencerReward);
  }

  /**
   * @notice Removes the entry of `_registry`, so its validators earn the default again
   * @param _registry The ATP registry, which must have an entry
   */
  function removeRegistryReward(address _registry) external onlyOwner {
    require(entries[_registry].exists, RegistryReductionCalculator__UnknownRegistry(_registry));
    delete entries[_registry];
    emit RegistryRewardRemoved(_registry);
  }

  /**
   * @notice Returns the entry of `_registry`
   * @param _registry The ATP registry
   * @return exists Whether the registry has an entry
   * @return sequencerReward The configured reward, before the cap at the default
   */
  function getRegistryReward(address _registry) external view returns (bool exists, uint96 sequencerReward) {
    Entry memory entry = entries[_registry];
    return (entry.exists, entry.sequencerReward);
  }

  /**
   * @notice Returns the sequencer reward of each newly proven checkpoint
   * @dev Never reverts within the stipend the rollup forwards: the only unbounded external read is the GSE's
   *      withdrawer lookup, a protocol view.
   * @param _proposers One attester per newly proven checkpoint, in checkpoint order
   * @param _defaultReward The default sequencer reward per checkpoint
   * @return rewards `min(_defaultReward, entry)` for proposers that resolve to a registry with an entry, and
   *         `_defaultReward` otherwise, in the order of `_proposers`
   */
  function getSequencerRewards(Epoch, address[] calldata _proposers, uint256 _defaultReward, uint256)
    external
    view
    override(ISequencerRewardCalculator)
    returns (uint256[] memory rewards)
  {
    uint256 n = _proposers.length;
    rewards = new uint256[](n);
    address[] memory seen = new address[](n);
    uint256[] memory seenRewards = new uint256[](n);
    uint256 distinct = 0;

    for (uint256 i = 0; i < n; i++) {
      address proposer = _proposers[i];
      uint256 j = 0;
      while (j < distinct && seen[j] != proposer) {
        j++;
      }
      if (j == distinct) {
        seen[j] = proposer;
        seenRewards[j] = _getSequencerReward(proposer, _defaultReward);
        distinct++;
      }
      rewards[i] = seenRewards[j];
    }
  }

  /**
   * @notice Resolves the ATP registry an attester is staked through
   * @param _attester The attester
   * @return resolved Whether both probes returned a well-formed, non-zero address
   * @return registry The registry, or zero when the lookup did not resolve
   */
  function resolveRegistry(address _attester) public view returns (bool resolved, address registry) {
    address withdrawer = GSE.getWithdrawer(_attester);
    (bool ok, address atp) = ProbeLib.tryGetAddress(withdrawer, IATPStaker.getATP.selector, PROBE_GAS);
    if (!ok || atp == address(0)) {
      return (false, address(0));
    }
    (ok, registry) = ProbeLib.tryGetAddress(atp, IATP.getRegistry.selector, PROBE_GAS);
    if (!ok || registry == address(0)) {
      return (false, address(0));
    }
    return (true, registry);
  }

  function _getSequencerReward(address _attester, uint256 _defaultReward) internal view returns (uint256) {
    (bool resolved, address registry) = resolveRegistry(_attester);
    if (!resolved) {
      return _defaultReward;
    }
    Entry memory entry = entries[registry];
    if (!entry.exists) {
      return _defaultReward;
    }
    return Math.min(_defaultReward, entry.sequencerReward);
  }
}
