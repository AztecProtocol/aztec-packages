// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct Info {
  address withdrawer;
  address proposer;
}

struct InstanceStaking {
  SnapshottedAddressSet attesters;
  mapping(address attester => Info) infoOf;
  mapping(address attester => uint256) balanceOf;
  bool exists;
}

interface IGSE {
  error GSE__AttesterNotFound(address instance, address attester);
  error GSE__AttesterAlreadyRegistered(address instance, address attester);

  function addRollup(address _rollup) external;
  function deposit(address _attester, address _proposer, address _withdrawer, bool _onCanonical)
    external;
  function withdraw(address _attester, uint256 _amount) external returns (uint256, bool);

  function isRegistered(address _instance, address _attester) external view returns (bool);
  function getWithdrawer(address _instance, address _attester)
    external
    view
    returns (address, bool, bool);
  function balanceOf(address _instance, address _attester) external view returns (uint256);
  function getInfo(address _instance, address _attester) external view returns (Info memory);
  function getAttesterCountAtTimestamp(address _instance, Timestamp _timestamp)
    external
    view
    returns (uint256);
  function getProposer(address _instance, address _attester)
    external
    view
    returns (address, bool, bool);
  function getAttestersFromIndicesAtTimestamp(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) external view returns (address[] memory);
  function getAttestersAtTimestamp(address _instance, Timestamp _timestamp)
    external
    view
    returns (address[] memory);
  function getAttesterFromIndexAtTimestamp(address _instance, uint256 _index, Timestamp _timestamp)
    external
    view
    returns (address);
}

contract GSE is IGSE {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;

  uint256 public constant MINIMUM_DEPOSIT = 100e18;
  uint256 public constant MINIMUM_BALANCE = 80e18;

  address public constant CANONICAL_MAGIC_ADDRESS =
    address(uint160(uint256(keccak256("canonical"))));

  IGovernance public immutable GOVERNANCE;
  IRegistry public immutable REGISTRY;
  IERC20 public immutable STAKING_ASSET;

  address public canonical;
  mapping(address instance => InstanceStaking) internal instances;

  modifier onlyRollup() {
    require(instances[msg.sender].exists, "Not a rollup");
    _;
  }

  constructor(IGovernance _governance, IRegistry _registry, IERC20 _stakingAsset) {
    GOVERNANCE = _governance;
    REGISTRY = _registry;
    STAKING_ASSET = _stakingAsset;
    instances[CANONICAL_MAGIC_ADDRESS].exists = true;
  }

  function addRollup(address _rollup) external override(IGSE) {
    require(msg.sender == address(GOVERNANCE), "Not the registry");
    require(_rollup != address(0), "Rollup not found");
    require(!instances[_rollup].exists, "Rollup already not registered");
    instances[_rollup].exists = true;
    canonical = _rollup;
  }

  function deposit(address _attester, address _proposer, address _withdrawer, bool _onCanonical)
    external
    override(IGSE)
    onlyRollup
  {
    require(!_onCanonical || canonical == msg.sender, "Not the canonical rollup");

    // Ensure that it is not already registered on the canonical or this rollup
    // We wish to avoid that such that are no ambiguity around who is the proposer and such.
    // The safest way to do this is that only valid rollups can register validators, and that
    // rollups only become valid when they are added as the new canonical, and cannot "flip-flop".
    // That way, it is not possible to have registered validators before the canonical was moved
    // and collisions would have happened.

    (, bool attesterExists,) = _getInstanceStoreWithAttester(msg.sender, _attester);
    require(!attesterExists, "Attester found");

    InstanceStaking storage instanceStaking =
      instances[_onCanonical ? CANONICAL_MAGIC_ADDRESS : msg.sender];
    require(instanceStaking.attesters.add(_attester), "Validator already registered");
    instanceStaking.infoOf[_attester] = Info({withdrawer: _withdrawer, proposer: _proposer});
    instanceStaking.balanceOf[_attester] += MINIMUM_DEPOSIT;

    STAKING_ASSET.transferFrom(msg.sender, address(this), MINIMUM_DEPOSIT);
  }

  /**
   * @notice  Withdraws at least the amount specified.
   *          If the leftover balance is less than the minimum deposit, the entire balance is withdrawn.
   *
   * @dev     To be used by the rollup to withdraw funds from the GSE. For example if slashing or
   *          just withdrawing events happen, the rollup can use this function to withdraw the funds.
   *          Will be taking into account the "canonical" as well.
   *
   * @param _attester The attester to withdraw from.
   * @return The actual amount withdrawn.
   */
  function withdraw(address _attester, uint256 _amount)
    external
    override(IGSE)
    onlyRollup
    returns (uint256, bool)
  {
    (InstanceStaking storage instanceStaking, bool attesterExists,) =
      _getInstanceStoreWithAttester(msg.sender, _attester);

    require(attesterExists, "Attester not found");

    uint256 balance = instanceStaking.balanceOf[_attester];
    require(balance >= _amount, "Insufficient balance");

    uint256 amountWithdrawn = _amount;
    bool removed = balance - _amount < MINIMUM_BALANCE;

    // By default, we will be removing, but in the case of slash, we might just reduce.
    if (removed) {
      require(instanceStaking.attesters.remove(_attester), "Failed to remove attester");
      delete instanceStaking.infoOf[_attester];
      amountWithdrawn = balance;
    }

    instanceStaking.balanceOf[_attester] -= amountWithdrawn;
    STAKING_ASSET.transfer(msg.sender, amountWithdrawn);

    return (amountWithdrawn, removed);
  }

  function isRegistered(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (bool)
  {
    (, bool attesterExists,) = _getInstanceStoreWithAttester(_instance, _attester);
    return attesterExists;
  }

  function getInfo(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (Info memory)
  {
    (InstanceStaking storage instanceStaking, bool attesterExists,) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return Info({withdrawer: address(0), proposer: address(0)});
    }

    return instanceStaking.infoOf[_attester];
  }

  function getWithdrawer(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address withdrawer, bool attesterExists, bool isCanonical)
  {
    InstanceStaking storage instanceStaking;
    (instanceStaking, attesterExists, isCanonical) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return (address(0), false, false);
    }

    return (instanceStaking.infoOf[_attester].withdrawer, true, isCanonical);
  }

  function getProposer(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address proposer, bool attesterExists, bool isCanonical)
  {
    InstanceStaking storage instanceStaking;
    (instanceStaking, attesterExists, isCanonical) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return (address(0), false, false);
    }

    return (instanceStaking.infoOf[_attester].proposer, true, isCanonical);
  }

  function balanceOf(address _instance, address _attester)
    public
    view
    override(IGSE)
    returns (uint256)
  {
    (InstanceStaking storage store, bool attesterExists,) =
      _getInstanceStoreWithAttester(_instance, _attester);
    return attesterExists ? store.balanceOf[_attester] : 0;
  }

  function getAttesterCountAtTimestamp(address _instance, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (uint256)
  {
    InstanceStaking storage store = instances[_instance];
    uint32 timestamp = Timestamp.unwrap(_timestamp).toUint32();

    uint256 count = store.attesters.lengthAtTimestamp(timestamp);
    if (canonical == _instance) {
      count += instances[CANONICAL_MAGIC_ADDRESS].attesters.lengthAtTimestamp(timestamp);
    }

    return count;
  }

  function getAttestersAtTimestamp(address _instance, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (address[] memory)
  {
    // @todo Throw me in jail for this crime against humanity
    uint256 count = getAttesterCountAtTimestamp(_instance, _timestamp);
    uint256[] memory indices = new uint256[](count);
    for (uint256 i = 0; i < count; i++) {
      indices[i] = i;
    }

    return _getAddressFromIndecesAtTimestamp(_instance, indices, _timestamp);
  }

  function getAttesterFromIndexAtTimestamp(address _instance, uint256 _index, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (address)
  {
    uint256[] memory indices = new uint256[](1);
    indices[0] = _index;
    return _getAddressFromIndecesAtTimestamp(_instance, indices, _timestamp)[0];
  }

  function getAttestersFromIndicesAtTimestamp(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) public view override(IGSE) returns (address[] memory) {
    return _getAddressFromIndecesAtTimestamp(_instance, _indices, _timestamp);
  }

  // We are using this only to get a simpler setup and logic to improve velocity of coding.
  // @todo Optimize this.
  function _getAddressFromIndecesAtTimestamp(
    address _instance,
    uint256[] memory _indices,
    Timestamp _timestamp
  ) internal view returns (address[] memory) {
    address[] memory attesters = new address[](_indices.length);

    InstanceStaking storage store = instances[_instance];
    InstanceStaking storage canonicalStore = instances[CANONICAL_MAGIC_ADDRESS];
    bool isCanonical = canonical == _instance;

    uint32 ts = Timestamp.unwrap(_timestamp).toUint32();

    uint256 storeSize = store.attesters.lengthAtTimestamp(ts);
    uint256 canonicalSize = isCanonical ? canonicalStore.attesters.lengthAtTimestamp(ts) : 0;
    uint256 totalSize = storeSize + canonicalSize;

    for (uint256 i = 0; i < _indices.length; i++) {
      uint256 index = _indices[i];
      require(index < totalSize, "Index out of bounds");

      if (index < storeSize) {
        attesters[i] = store.attesters.getAddressFromIndexAtTimestamp(index, ts);
      } else {
        attesters[i] =
          canonicalStore.attesters.getAddressFromIndexAtTimestamp(index - storeSize, ts);
      }
    }

    return attesters;
  }

  function _getInstanceStoreWithAttester(address _instance, address _attester)
    internal
    view
    returns (InstanceStaking storage store, bool attesterExists, bool isCanonical)
  {
    store = instances[_instance];
    attesterExists = store.attesters.contains(_attester);
    isCanonical = false;

    if (
      !attesterExists && canonical == _instance
        && instances[CANONICAL_MAGIC_ADDRESS].attesters.contains(_attester)
    ) {
      store = instances[CANONICAL_MAGIC_ADDRESS];
      attesterExists = true;
      isCanonical = true;
    }

    return (store, attesterExists, isCanonical);
  }
}
