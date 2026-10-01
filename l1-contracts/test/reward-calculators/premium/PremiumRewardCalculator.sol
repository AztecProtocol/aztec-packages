// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {MAX_SEQUENCER_REWARD_PER_CHECKPOINT} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {ProbeLib} from "@test/reward-calculators/ProbeLib.sol";
import {IPremiumATP, IPremiumATPFactory, IPremiumATPStaker} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/**
 * @title PremiumRewardCalculator
 * @author Aztec Labs
 * @notice Reference sequencer reward calculator that pays an owner-configured reward per Aztec Token Position (ATP)
 *         registry, including premiums above the default for validators whose stake provably comes from a
 *         premium-eligible position's allocation.
 *
 * @dev Lookup. A proposer resolves as `withdrawer = GSE.getWithdrawer(attester)`, `atp = withdrawer.getATP()`,
 *      `registry = atp.getRegistry()`, and the registry's entry decides:
 *      - no entry, or any lookup failing: the default;
 *      - an entry at or below the default: the entry, unauthenticated. Faking membership of a registry can only
 *        lower one's own reward;
 *      - an entry above the default without a provenance source: the default. The cap is applied at read time, so
 *        a later `setRewardConfig` that lowers the default never turns such an entry into a premium;
 *      - an entry above the default with a provenance source (the registry's factory): the entry if and only if
 *        (1) `source.isATP(atp)`, (2) `atp.getStaker() == withdrawer` and (3) `withdrawer.isAttester(attester)` all
 *        hold, else the default.
 *
 *      Security argument. `Rollup.deposit` lets anyone name any withdrawer, and the withdrawer, its `getATP()` and
 *      the position's `getRegistry()` are all answers the depositor can choose. Each check closes one way to forge
 *      them, against a contract the proposer cannot deploy or change:
 *      (1) closes positions not created by the factory, including clones of the genuine implementation, which
 *          answer `getRegistry()` exactly like genuine positions;
 *      (2) closes withdrawers that point at someone else's genuine position: a genuine position names only the
 *          staker it created;
 *      (3) closes liquid stake deposited with a genuine staker as withdrawer: that staker records only attesters it
 *          deposited after reserving the allocation, so for every position, premium-earning attesters x activation
 *          threshold <= reserved <= allocation - claimed (see `PremiumATPStaker`).
 *      The checks run in that order, so each one only trusts answers from contracts the previous checks
 *      authenticated: after (1) the position is genuine code, after (2) the withdrawer is the genuine staker.
 *
 *      Trust roots: this contract's owner (the table and the provenance source of each registry), each factory's
 *      owner and minters (who gets a position), each registry's owner (the unlock schedule), and the token, rollup
 *      registry and staking registry the factory binds its stakers to. Stakers are not upgradeable; an upgradeable
 *      staker would make its upgrade authority a trust root too, and an implementation that lies in `isAttester`
 *      cannot be detected through the staker's own answers.
 *
 *      Liveness. The calculator never reverts within the stipend the rollup forwards. Every call into a contract
 *      the proposer may control is a bounded probe (`ProbeLib`): fixed gas, exactly 32 bytes of canonical return
 *      data, never reverting; any failure pays the default. The only other external read is the GSE's withdrawer
 *      lookup, a protocol view.
 *
 *      Caching. Each distinct proposer is resolved once per call and cached in memory per attester, never per
 *      registry or position: a registry-keyed cache would let a forged position in the same proof inherit a premium
 *      that a genuine one earned. The calculator ignores `msg.sender` and reads only the GSE, which every rollup
 *      version shares. Lookups reflect state when the proof lands: an attester released before then earns the
 *      default for checkpoints it proposed earlier.
 *
 *      Residual risks, accepted. Tokens are fungible, so the guarantee is about amounts, not coins: the premium is
 *      backed by a reservation of the allocation, not necessarily by the deposited tokens (a front-run of the
 *      staker's own deposit leaves a recorded attester funded by someone else, while the staker's refund returns
 *      to the position, see `PremiumATPStaker`). A beneficiary chooses which of its validators the allocation
 *      backs, never more than the allocation covers. A provenance source paired with the wrong registry, or an
 *      entry with no source, pays only the default. A provenance source or registry owner that turns hostile is a
 *      trust root failure that no check here can detect.
 */
contract PremiumRewardCalculator is Ownable, ISequencerRewardCalculator {
  struct Entry {
    bool exists;
    uint96 sequencerReward;
    address provenanceSource;
  }

  /// @notice Gas forwarded to each probe.
  /// @dev Per distinct proposer the calculator runs one GSE read and up to five probes. Genuine positions answer
  ///      each probe in at most about 5.3k gas when cold (an EIP-1167 delegation to a cold implementation and one
  ///      cold storage read), so this leaves them a margin of about 1.9x. With it, even five probes that all burn
  ///      their whole stipend fit `CALCULATOR_GAS_PER_CHECKPOINT` with about a quarter of the stipend to spare,
  ///      although contracts the proposer can deploy can only make the first two probes expensive: the third asks
  ///      the provenance source, and after it every target is genuine code. A production deployment must re-derive
  ///      this from the probe costs of the production contracts (an ERC1967 proxy costs more than a clone).
  uint256 public constant PROBE_GAS = 10_000;

  /// @notice The GSE whose withdrawers are resolved.
  IGSE public immutable GSE;

  mapping(address registry => Entry entry) internal entries;

  /**
   * @notice Emitted when a registry's reward is set
   * @param registry The ATP registry
   * @param sequencerReward The sequencer reward per checkpoint
   * @param provenanceSource The factory that authenticates premiums, zero for none
   */
  event RegistryRewardSet(address indexed registry, uint96 sequencerReward, address indexed provenanceSource);

  /**
   * @notice Emitted when a registry's reward is removed
   * @param registry The ATP registry
   */
  event RegistryRewardRemoved(address indexed registry);

  error PremiumRewardCalculator__InvalidGSE(address gse);
  error PremiumRewardCalculator__ZeroRegistry();
  error PremiumRewardCalculator__UnknownRegistry(address registry);
  error PremiumRewardCalculator__RewardAboveMaximum(uint256 reward, uint256 maximum);
  error PremiumRewardCalculator__InvalidProvenanceSource(address provenanceSource);

  /**
   * @param _gse The GSE whose withdrawers are resolved
   * @param _owner The owner allowed to configure registry rewards (Governance)
   */
  constructor(IGSE _gse, address _owner) Ownable(_owner) {
    require(address(_gse).code.length > 0, PremiumRewardCalculator__InvalidGSE(address(_gse)));
    GSE = _gse;
  }

  /**
   * @notice Sets the sequencer reward of validators staked through positions of `_registry`
   * @dev Zero is a valid reward. A reward above the default is paid only to authenticated positions of
   *      `_provenanceSource`, and never if the source is zero. Rewards above the rollup's validity bound are
   *      rejected, since one such value would make the rollup discard the whole response.
   * @param _registry The ATP registry, not zero
   * @param _sequencerReward The sequencer reward per checkpoint, at most `MAX_SEQUENCER_REWARD_PER_CHECKPOINT`
   * @param _provenanceSource The factory of the registry's positions, a contract, or zero for none
   */
  function setRegistryReward(address _registry, uint96 _sequencerReward, address _provenanceSource) external onlyOwner {
    require(_registry != address(0), PremiumRewardCalculator__ZeroRegistry());
    require(
      _sequencerReward <= MAX_SEQUENCER_REWARD_PER_CHECKPOINT,
      PremiumRewardCalculator__RewardAboveMaximum(_sequencerReward, MAX_SEQUENCER_REWARD_PER_CHECKPOINT)
    );
    require(
      _provenanceSource == address(0) || _provenanceSource.code.length > 0,
      PremiumRewardCalculator__InvalidProvenanceSource(_provenanceSource)
    );
    entries[_registry] = Entry({exists: true, sequencerReward: _sequencerReward, provenanceSource: _provenanceSource});
    emit RegistryRewardSet(_registry, _sequencerReward, _provenanceSource);
  }

  /**
   * @notice Removes the entry of `_registry`, so its validators earn the default again
   * @param _registry The ATP registry, which must have an entry
   */
  function removeRegistryReward(address _registry) external onlyOwner {
    require(entries[_registry].exists, PremiumRewardCalculator__UnknownRegistry(_registry));
    delete entries[_registry];
    emit RegistryRewardRemoved(_registry);
  }

  /**
   * @notice Returns the entry of `_registry`
   * @param _registry The ATP registry
   * @return exists Whether the registry has an entry
   * @return sequencerReward The configured reward
   * @return provenanceSource The factory that authenticates premiums, zero for none
   */
  function getRegistryReward(address _registry)
    external
    view
    returns (bool exists, uint96 sequencerReward, address provenanceSource)
  {
    Entry memory entry = entries[_registry];
    return (entry.exists, entry.sequencerReward, entry.provenanceSource);
  }

  /**
   * @notice Returns the sequencer reward of each newly proven checkpoint
   * @param _proposers One attester per newly proven checkpoint, in checkpoint order
   * @param _defaultReward The default sequencer reward per checkpoint
   * @return rewards The reward of each proposer, in the order of `_proposers` (see the contract documentation)
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
        seenRewards[j] = getSequencerReward(proposer, _defaultReward);
        distinct++;
      }
      rewards[i] = seenRewards[j];
    }
  }

  /**
   * @notice Returns the sequencer reward of one attester, as `getSequencerRewards` computes it
   * @param _attester The attester
   * @param _defaultReward The default sequencer reward per checkpoint
   * @return The reward
   */
  function getSequencerReward(address _attester, uint256 _defaultReward) public view returns (uint256) {
    address withdrawer = GSE.getWithdrawer(_attester);
    (bool ok, address atp) = ProbeLib.tryGetAddress(withdrawer, IATPStaker.getATP.selector, PROBE_GAS);
    if (!ok || atp == address(0)) {
      return _defaultReward;
    }
    address registry;
    (ok, registry) = ProbeLib.tryGetAddress(atp, IATP.getRegistry.selector, PROBE_GAS);
    if (!ok || registry == address(0)) {
      return _defaultReward;
    }

    Entry storage entry = entries[registry];
    if (!entry.exists) {
      return _defaultReward;
    }
    uint256 reward = entry.sequencerReward;
    if (reward <= _defaultReward) {
      return reward;
    }
    address provenanceSource = entry.provenanceSource;
    if (provenanceSource == address(0)) {
      return _defaultReward;
    }
    return isAuthenticated(_attester, withdrawer, atp, provenanceSource) ? reward : _defaultReward;
  }

  /**
   * @notice Returns whether `_attester` is staked from the allocation of `_atp`, a position of `_provenanceSource`,
   *         through `_withdrawer`, its staker
   * @dev The three probes run in order and stop at the first failure.
   * @param _attester The attester
   * @param _withdrawer The attester's GSE withdrawer
   * @param _atp The position the withdrawer points at
   * @param _provenanceSource The factory of the position's registry
   * @return True if all three checks pass
   */
  function isAuthenticated(address _attester, address _withdrawer, address _atp, address _provenanceSource)
    public
    view
    returns (bool)
  {
    (bool ok, bool created) = ProbeLib.tryGetBool(_provenanceSource, IPremiumATPFactory.isATP.selector, _atp, PROBE_GAS);
    if (!ok || !created) {
      return false;
    }
    (bool okStaker, address staker) = ProbeLib.tryGetAddress(_atp, IPremiumATP.getStaker.selector, PROBE_GAS);
    if (!okStaker || staker != _withdrawer) {
      return false;
    }
    (bool okRecord, bool recorded) =
      ProbeLib.tryGetBool(_withdrawer, IPremiumATPStaker.isAttester.selector, _attester, PROBE_GAS);
    return okRecord && recorded;
  }
}
