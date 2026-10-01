// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface

import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice Stand-in for the reward split factory the StakingRegistry calls after a deposit.
 */
contract MockSplitFactory {
  uint256 public splitCount;

  function createSplit(address[] memory, uint256[] memory, address, address) external returns (address split) {
    splitCount++;
    split = address(uint160(uint256(keccak256(abi.encode("split", splitCount)))));
  }
}

/**
 * @notice Mirrors the call structure of `StakingRegistry.stake` in ignition-contracts: the caller names the
 *         withdrawal address, the registry dequeues the provider's next key (first in, first out), pulls one
 *         activation threshold from the caller, deposits it into the rollup with that withdrawal address, then calls
 *         the split factory. It does not return the attester.
 * @dev `behaviour` lets a test turn it into a hostile registry, to show what the staker's entry queue checks catch
 *      and that its reservation holds even when they do not.
 */
contract MockStakingRegistry is IStakingRegistry {
  using SafeERC20 for IERC20;

  enum Behaviour {
    Honest,
    // Deposits with its own address as the withdrawer instead of the one it was given.
    SwapWithdrawer,
    // Makes the honest deposit, then one more for another of the provider's keys, from its own funds.
    DepositTwice,
    // Takes the tokens and deposits nothing.
    NoDeposit,
    // Keeps the caller's tokens and deposits another of the provider's keys from its own funds, with the given
    // withdrawal address: the entry queue checks pass, but the recorded attester was not funded by the caller.
    SubstituteAttester
  }

  struct KeyStore {
    address attester;
    G1Point publicKeyG1;
    G2Point publicKeyG2;
    G1Point proofOfPossession;
  }

  struct Provider {
    address admin;
    uint16 takeRate;
    address rewardsRecipient;
    uint256 next;
    KeyStore[] keys;
  }

  IERC20 public immutable STAKING_ASSET;
  MockSplitFactory public immutable PULL_SPLIT_FACTORY;
  IRegistry public immutable ROLLUP_REGISTRY;

  Behaviour public behaviour;
  uint256 public nextProviderIdentifier;
  mapping(uint256 providerIdentifier => Provider provider) internal providers;

  event StakedWithProvider(
    uint256 indexed providerIdentifier,
    address indexed rollupAddress,
    address indexed attester,
    address coinbaseSplitContractAddress,
    address stakerImplementation
  );

  error StakingRegistry__ZeroAddress();
  error StakingRegistry__InvalidProviderIdentifier(uint256 providerIdentifier);
  error StakingRegistry__NotProviderAdmin();
  error StakingRegistry__UnexpectedTakeRate(uint256 expectedTakeRate, uint256 gotTakeRate);
  error StakingRegistry__QueueIsEmpty();

  constructor(IERC20 _stakingAsset, MockSplitFactory _pullSplitFactory, IRegistry _rollupRegistry) {
    STAKING_ASSET = _stakingAsset;
    PULL_SPLIT_FACTORY = _pullSplitFactory;
    ROLLUP_REGISTRY = _rollupRegistry;
  }

  function setBehaviour(Behaviour _behaviour) external {
    behaviour = _behaviour;
  }

  function registerProvider(address _admin, uint16 _takeRate, address _rewardsRecipient) external returns (uint256 id) {
    id = nextProviderIdentifier++;
    Provider storage provider = providers[id];
    provider.admin = _admin;
    provider.takeRate = _takeRate;
    provider.rewardsRecipient = _rewardsRecipient;
  }

  function addKeysToProvider(uint256 _providerIdentifier, KeyStore[] calldata _keyStores) external {
    Provider storage provider = providers[_providerIdentifier];
    require(msg.sender == provider.admin, StakingRegistry__NotProviderAdmin());
    for (uint256 i = 0; i < _keyStores.length; i++) {
      provider.keys.push(_keyStores[i]);
    }
  }

  function getProviderQueueLength(uint256 _providerIdentifier) external view returns (uint256) {
    Provider storage provider = providers[_providerIdentifier];
    return provider.keys.length - provider.next;
  }

  function stake(
    uint256 _providerIdentifier,
    uint256 _rollupVersion,
    address _withdrawalAddress,
    uint16 _expectedProviderTakeRate,
    address _userRewardsRecipient,
    bool _moveWithLatestRollup
  ) external override(IStakingRegistry) {
    Provider storage provider = providers[_providerIdentifier];
    require(provider.admin != address(0), StakingRegistry__InvalidProviderIdentifier(_providerIdentifier));
    require(_withdrawalAddress != address(0), StakingRegistry__ZeroAddress());
    require(_userRewardsRecipient != address(0), StakingRegistry__ZeroAddress());
    require(
      _expectedProviderTakeRate == provider.takeRate,
      StakingRegistry__UnexpectedTakeRate(_expectedProviderTakeRate, provider.takeRate)
    );

    address rollupAddress = address(ROLLUP_REGISTRY.getRollup(_rollupVersion));
    require(rollupAddress != address(0), StakingRegistry__ZeroAddress());

    KeyStore memory keyStore = _dequeue(provider);

    uint256 activationThreshold = IStaking(rollupAddress).getActivationThreshold();
    STAKING_ASSET.safeTransferFrom(msg.sender, address(this), activationThreshold);
    STAKING_ASSET.approve(rollupAddress, type(uint256).max);

    Behaviour mode = behaviour;
    if (mode == Behaviour.SubstituteAttester) {
      keyStore = _dequeue(provider);
    }
    if (mode != Behaviour.NoDeposit) {
      _deposit(
        rollupAddress,
        keyStore,
        mode == Behaviour.SwapWithdrawer ? address(this) : _withdrawalAddress,
        _moveWithLatestRollup
      );
    }
    if (mode == Behaviour.DepositTwice) {
      _deposit(rollupAddress, _dequeue(provider), _withdrawalAddress, _moveWithLatestRollup);
    }

    address[] memory recipients = new address[](2);
    recipients[0] = provider.rewardsRecipient;
    recipients[1] = _userRewardsRecipient;
    uint256[] memory allocations = new uint256[](2);
    allocations[0] = provider.takeRate;
    allocations[1] = 10_000 - provider.takeRate;
    address split = PULL_SPLIT_FACTORY.createSplit(recipients, allocations, address(0), address(this));

    emit StakedWithProvider(_providerIdentifier, rollupAddress, keyStore.attester, split, msg.sender);
  }

  function _deposit(address _rollup, KeyStore memory _key, address _withdrawer, bool _moveWithLatestRollup) internal {
    IStaking(_rollup)
      .deposit(
        _key.attester, _withdrawer, _key.publicKeyG1, _key.publicKeyG2, _key.proofOfPossession, _moveWithLatestRollup
      );
  }

  function _dequeue(Provider storage _provider) internal returns (KeyStore memory key) {
    require(_provider.next < _provider.keys.length, StakingRegistry__QueueIsEmpty());
    key = _provider.keys[_provider.next];
    _provider.next++;
  }
}
