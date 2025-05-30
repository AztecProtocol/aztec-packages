// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

struct AttesterConfig {
  address withdrawer;
}

struct InstanceStaking {
  SnapshottedAddressSet attesters;
  mapping(address attester => AttesterConfig) configOf;
  mapping(address attester => uint256) balanceOf;
  uint256 supply;
  bool exists;
}

interface IGSE {
  event Deposit(address indexed instance, address indexed attester, address withdrawer);

  function addRollup(address _rollup) external;
  function deposit(address _attester, address _withdrawer, bool _onCanonical) external;
  function withdraw(address _attester, uint256 _amount) external returns (uint256, bool);

  function isRegistered(address _instance, address _attester) external view returns (bool);
  function isRollupRegistered(address _instance) external view returns (bool);
  function getWithdrawer(address _instance, address _attester)
    external
    view
    returns (address, bool, bool);
  function balanceOf(address _instance, address _attester) external view returns (uint256);
  function supplyOf(address _instance) external view returns (uint256);
  function totalSupply() external view returns (uint256);
  function getConfig(address _instance, address _attester)
    external
    view
    returns (AttesterConfig memory);
  function getAttesterCountAtTime(address _instance, Timestamp _timestamp)
    external
    view
    returns (uint256);
  function getProposer(address _instance, address _attester)
    external
    view
    returns (address, bool, bool);
  function getAttestersFromIndicesAtTime(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) external view returns (address[] memory);
  function getAttestersAtTime(address _instance, Timestamp _timestamp)
    external
    view
    returns (address[] memory);
  function getAttesterFromIndexAtTime(address _instance, uint256 _index, Timestamp _timestamp)
    external
    view
    returns (address);

  function getCanonical() external view returns (address);

  function getCanonicalAt(Timestamp _timestamp) external view returns (address);
}

contract GSE is IGSE, Ownable {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;
  using SafeCast for uint224;
  using Checkpoints for Checkpoints.Trace224;

  uint256 public constant MINIMUM_DEPOSIT = 100e18;
  // @todo https://github.com/AztecProtocol/aztec-packages/issues/14304
  uint256 public constant MINIMUM_BALANCE = 100e18;

  address public constant CANONICAL_MAGIC_ADDRESS =
    address(uint160(uint256(keccak256("canonical"))));

  IERC20 public immutable STAKING_ASSET;

  uint256 public totalSupply;
  Checkpoints.Trace224 internal canonical;
  mapping(address instance => InstanceStaking) internal instances;

  modifier onlyRollup() {
    require(instances[msg.sender].exists, Errors.Staking__NotRollup(msg.sender));
    _;
  }

  constructor(address __owner, IERC20 _stakingAsset) Ownable(__owner) {
    STAKING_ASSET = _stakingAsset;
    instances[CANONICAL_MAGIC_ADDRESS].exists = true;
  }

  function addRollup(address _rollup) external override(IGSE) onlyOwner {
    require(_rollup != address(0), Errors.Staking__InvalidRollupAddress(_rollup));
    require(!instances[_rollup].exists, Errors.Staking__RollupAlreadyRegistered(_rollup));
    instances[_rollup].exists = true;
    canonical.push(block.timestamp.toUint32(), uint224(uint160(_rollup)));
  }

  /**
   * @notice  Deposits a new validator on the rollup
   *
   * @dev     The attester key is used as the primary key, and duplicates in the same functional set
   *          must not occur. Functional set here being `specific ∪ canonical`.
   *          E.g., it is not acceptable to have attester `a` in both the `canonical` accounting and
   *          the specific instance accounting, `A` if `A` can become the `canonical`.
   *          However, it is fine to have the same attester in `A`, `B` and `C` as long as they were
   *          never in the same functional set.
   *
   * @dev     Deposits only allowed to and by listed rollups.
   *
   * @param _attester - The attester address of the validator
   * @param _withdrawer - The withdrawer address of the validator
   * @param _onCanonical - Whether to deposit into the specific instance, or canonical
   *  @dev Must be the current canonical for `_onCanonical = true` to be valid.
   */
  function deposit(address _attester, address _withdrawer, bool _onCanonical)
    external
    override(IGSE)
    onlyRollup
  {
    require(!_onCanonical || getCanonical() == msg.sender, Errors.Staking__NotCanonical(msg.sender));

    (, bool attesterExists,) = _getInstanceStoreWithAttester(msg.sender, _attester);
    require(!attesterExists, Errors.Staking__AlreadyRegistered(_attester));

    InstanceStaking storage instanceStaking =
      instances[_onCanonical ? CANONICAL_MAGIC_ADDRESS : msg.sender];
    require(instanceStaking.attesters.add(_attester), Errors.Staking__AlreadyRegistered(_attester));
    instanceStaking.configOf[_attester] = AttesterConfig({withdrawer: _withdrawer});
    instanceStaking.balanceOf[_attester] += MINIMUM_DEPOSIT;
    instanceStaking.supply += MINIMUM_DEPOSIT;
    totalSupply += MINIMUM_DEPOSIT;

    STAKING_ASSET.transferFrom(msg.sender, address(this), MINIMUM_DEPOSIT);

    emit Deposit(_onCanonical ? CANONICAL_MAGIC_ADDRESS : msg.sender, _attester, _withdrawer);
  }

  /**
   * @notice  Withdraws at least the amount specified.
   *          If the leftover balance is less than the minimum deposit, the entire balance is withdrawn.
   *
   * @dev     To be used by the rollup to withdraw funds from the GSE. For example if slashing or
   *          just withdrawing events happen, the rollup can use this function to withdraw the funds.
   *          Will be taking into account the "canonical" as well.
   *
   * @dev     Note that all funds are returned to the rollup, so for slashing the rollup itself must
   *          address the problem of "what to do" with the funds. And it must look at the returned amount
   *          withdrawn and the bool.
   *
   * @param _attester The attester to withdraw from.
   *
   * @return The actual amount withdrawn.
   * @return True if attester is removed from set, false otherwise
   */
  function withdraw(address _attester, uint256 _amount)
    external
    override(IGSE)
    onlyRollup
    returns (uint256, bool)
  {
    (InstanceStaking storage instanceStaking, bool attesterExists,) =
      _getInstanceStoreWithAttester(msg.sender, _attester);

    require(attesterExists, Errors.Staking__NothingToExit(_attester));

    uint256 balance = instanceStaking.balanceOf[_attester];
    require(balance >= _amount, Errors.Staking__InsufficientStake(balance, _amount));

    uint256 amountWithdrawn = _amount;
    bool isRemoved = balance - _amount < MINIMUM_BALANCE;

    // By default, we will be removing, but in the case of slash, we might just reduce.
    if (isRemoved) {
      require(
        instanceStaking.attesters.remove(_attester), Errors.Staking__FailedToRemove(_attester)
      );
      delete instanceStaking.configOf[_attester];
      amountWithdrawn = balance;
    }

    instanceStaking.balanceOf[_attester] -= amountWithdrawn;
    instanceStaking.supply -= amountWithdrawn;
    totalSupply -= amountWithdrawn;

    STAKING_ASSET.transfer(msg.sender, amountWithdrawn);

    return (amountWithdrawn, isRemoved);
  }

  function isRollupRegistered(address _instance) external view override(IGSE) returns (bool) {
    return instances[_instance].exists;
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

  function getConfig(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (AttesterConfig memory)
  {
    (InstanceStaking storage instanceStaking, bool attesterExists,) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return AttesterConfig({withdrawer: address(0)});
    }

    return instanceStaking.configOf[_attester];
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

    return (instanceStaking.configOf[_attester].withdrawer, true, isCanonical);
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

    return (_attester, true, isCanonical);
  }

  function balanceOf(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (uint256)
  {
    (InstanceStaking storage store, bool attesterExists,) =
      _getInstanceStoreWithAttester(_instance, _attester);
    return attesterExists ? store.balanceOf[_attester] : 0;
  }

  function supplyOf(address _instance) external view override(IGSE) returns (uint256) {
    InstanceStaking storage store = instances[_instance];

    uint256 supply = store.supply;
    if (getCanonical() == _instance) {
      supply += instances[CANONICAL_MAGIC_ADDRESS].supply;
    }

    return supply;
  }

  function getCanonical() public view override(IGSE) returns (address) {
    return address(canonical.latest().toUint160());
  }

  function getCanonicalAt(Timestamp _timestamp) public view override(IGSE) returns (address) {
    return address(canonical.upperLookup(Timestamp.unwrap(_timestamp).toUint32()).toUint160());
  }

  function getAttesterCountAtTime(address _instance, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (uint256)
  {
    InstanceStaking storage store = instances[_instance];
    uint32 timestamp = Timestamp.unwrap(_timestamp).toUint32();

    uint256 count = store.attesters.lengthAtTimestamp(timestamp);
    if (getCanonicalAt(_timestamp) == _instance) {
      count += instances[CANONICAL_MAGIC_ADDRESS].attesters.lengthAtTimestamp(timestamp);
    }

    return count;
  }

  function getAttestersAtTime(address _instance, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (address[] memory)
  {
    // @todo Throw me in jail for this crime against humanity
    uint256 count = getAttesterCountAtTime(_instance, _timestamp);
    uint256[] memory indices = new uint256[](count);
    for (uint256 i = 0; i < count; i++) {
      indices[i] = i;
    }

    return _getAddressFromIndicesAtTimestamp(_instance, indices, _timestamp);
  }

  function getAttesterFromIndexAtTime(address _instance, uint256 _index, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (address)
  {
    uint256[] memory indices = new uint256[](1);
    indices[0] = _index;
    return _getAddressFromIndicesAtTimestamp(_instance, indices, _timestamp)[0];
  }

  function getAttestersFromIndicesAtTime(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) public view override(IGSE) returns (address[] memory) {
    return _getAddressFromIndicesAtTimestamp(_instance, _indices, _timestamp);
  }

  // We are using this only to get a simpler setup and logic to improve velocity of coding.
  // @todo Optimize this.
  function _getAddressFromIndicesAtTimestamp(
    address _instance,
    uint256[] memory _indices,
    Timestamp _timestamp
  ) internal view returns (address[] memory) {
    address[] memory attesters = new address[](_indices.length);

    InstanceStaking storage store = instances[_instance];
    InstanceStaking storage canonicalStore = instances[CANONICAL_MAGIC_ADDRESS];
    bool isCanonical = getCanonicalAt(_timestamp) == _instance;

    uint32 ts = Timestamp.unwrap(_timestamp).toUint32();

    uint256 storeSize = store.attesters.lengthAtTimestamp(ts);
    uint256 canonicalSize = isCanonical ? canonicalStore.attesters.lengthAtTimestamp(ts) : 0;
    uint256 totalSize = storeSize + canonicalSize;

    for (uint256 i = 0; i < _indices.length; i++) {
      uint256 index = _indices[i];
      require(index < totalSize, Errors.Staking__OutOfBounds(index, totalSize));

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
      !attesterExists && getCanonical() == _instance
        && instances[CANONICAL_MAGIC_ADDRESS].attesters.contains(_attester)
    ) {
      store = instances[CANONICAL_MAGIC_ADDRESS];
      attesterExists = true;
      isCanonical = true;
    }

    return (store, attesterExists, isCanonical);
  }
}
