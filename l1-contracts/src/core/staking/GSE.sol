// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {DelegationLib, DelegationData} from "@aztec/core/libraries/staking/DelegationLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

struct AttesterConfig {
  address withdrawer;
  address proposer;
}

struct InstanceStaking {
  SnapshottedAddressSet attesters;
  mapping(address attester => AttesterConfig) configOf;
  bool exists;
}

interface IGSECore {
  event Deposit(
    address indexed instance, address indexed attester, address proposer, address withdrawer
  );

  function addRollup(address _rollup) external;
  function deposit(address _attester, address _proposer, address _withdrawer, bool _onCanonical)
    external;
  function withdraw(address _attester, uint256 _amount) external returns (uint256, bool);
  function delegate(address _instance, address _attester, address _delegatee) external;
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external;
  function voteWithCanonical(uint256 _proposalId, uint256 _amount, bool _support) external;

  function isRegistered(address _instance, address _attester) external view returns (bool);
  function isRollupRegistered(address _instance) external view returns (bool);
  function getCanonical() external view returns (address);
  function getCanonicalAt(Timestamp _timestamp) external view returns (address);
}

interface IGSE is IGSECore {
  function getDelegatee(address _instance, address _attester) external view returns (address);
  function getVotingPower(address _attester) external view returns (uint256);
  function getVotingPowerAt(address _attester, Timestamp _timestamp)
    external
    view
    returns (uint256);

  function getWithdrawer(address _instance, address _attester)
    external
    view
    returns (address, bool, address);
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
    returns (address, bool, address);
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
  function getPowerUsed(address _delegatee, uint256 _proposalId) external view returns (uint256);
}

contract GSECore is IGSECore, Ownable {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;
  using SafeCast for uint224;
  using Checkpoints for Checkpoints.Trace224;
  using DelegationLib for DelegationData;
  using ProposalLib for DataStructures.Proposal;

  uint256 public constant MINIMUM_DEPOSIT = 100e18;
  // @todo https://github.com/AztecProtocol/aztec-packages/issues/14304
  uint256 public constant MINIMUM_BALANCE = 100e18;

  address public constant CANONICAL_MAGIC_ADDRESS =
    address(uint160(uint256(keccak256("canonical"))));

  IERC20 public immutable STAKING_ASSET;

  Checkpoints.Trace224 internal canonical;
  mapping(address instance => InstanceStaking) internal instances;
  DelegationData internal delegation;

  modifier onlyRollup() {
    require(isRollupRegistered(msg.sender), Errors.Staking__NotRollup(msg.sender));
    _;
  }

  constructor(address __owner, IERC20 _stakingAsset) Ownable(__owner) {
    STAKING_ASSET = _stakingAsset;
    instances[CANONICAL_MAGIC_ADDRESS].exists = true;
  }

  /**
   * @notice  Adds another rollup to the instances
   *          Only callable by the owner (governance) and only when not already in the set
   *
   * @param _rollup - The address of the rollup to add
   */
  function addRollup(address _rollup) external override(IGSECore) onlyOwner {
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
   * @param _attester     - The attester address of the validator
   * @param _proposer     - The proposer address of the validator
   * @param _withdrawer   - The withdrawer address of the validator
   * @param _onCanonical  - Whether to deposit into the specific instance, or canonical
   *  @dev Must be the current canonical for `_onCanonical = true` to be valid.
   */
  function deposit(address _attester, address _proposer, address _withdrawer, bool _onCanonical)
    external
    override(IGSECore)
    onlyRollup
  {
    address instanceAddress = msg.sender;
    bool isCanonical = getCanonical() == instanceAddress;
    require(!_onCanonical || isCanonical, Errors.Staking__NotCanonical(instanceAddress));

    // Ensure that we are not already attesting on the specific
    require(
      !isRegistered(instanceAddress, _attester),
      Errors.Staking__AlreadyRegistered(instanceAddress, _attester)
    );
    // Ensure that if we are canonical, we are not already attesting on the canonical
    require(
      !isCanonical || !isRegistered(CANONICAL_MAGIC_ADDRESS, _attester),
      Errors.Staking__AlreadyRegistered(CANONICAL_MAGIC_ADDRESS, _attester)
    );

    if (_onCanonical) {
      instanceAddress = CANONICAL_MAGIC_ADDRESS;
    }

    require(
      instances[instanceAddress].attesters.add(_attester),
      Errors.Staking__AlreadyRegistered(instanceAddress, _attester)
    );

    instances[instanceAddress].configOf[_attester] =
      AttesterConfig({withdrawer: _withdrawer, proposer: _proposer});

    if (delegation.getDelegatee(instanceAddress, _attester) == address(0)) {
      delegation.delegate(instanceAddress, _attester, instanceAddress);
    }

    delegation.increaseBalance(instanceAddress, _attester, MINIMUM_DEPOSIT);

    STAKING_ASSET.transferFrom(msg.sender, address(this), MINIMUM_DEPOSIT);

    Governance gov = Governance(owner());
    STAKING_ASSET.approve(address(gov), MINIMUM_DEPOSIT);
    gov.deposit(address(this), MINIMUM_DEPOSIT);

    emit Deposit(instanceAddress, _attester, _proposer, _withdrawer);
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
   * @param _attester - The attester to withdraw from.
   * @param _amount   - The amount to withdraw
   *
   * @return The actual amount withdrawn.
   * @return True if attester is removed from set, false otherwise
   */
  function withdraw(address _attester, uint256 _amount)
    external
    override(IGSECore)
    onlyRollup
    returns (uint256, bool)
  {
    address instanceAddress = msg.sender;
    InstanceStaking storage instanceStaking = instances[instanceAddress];
    bool isAttester = instanceStaking.attesters.contains(_attester);

    // If we are canonical, and have not already found the attester we need to look
    // within the canonical accounting as well - it might be there.
    // We are figuring out where the attester is effectively located
    if (
      !isAttester && getCanonical() == instanceAddress
        && instances[CANONICAL_MAGIC_ADDRESS].attesters.contains(_attester)
    ) {
      instanceAddress = CANONICAL_MAGIC_ADDRESS;
      instanceStaking = instances[instanceAddress];
      isAttester = true;
    }

    require(isAttester, Errors.Staking__NothingToExit(_attester));

    uint256 balance = delegation.getBalanceOf(instanceAddress, _attester);
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

      // Update the delegate to address(0) when removing.
      delegation.delegate(instanceAddress, _attester, address(0));
    }

    delegation.decreaseBalance(instanceAddress, _attester, amountWithdrawn);

    STAKING_ASSET.transfer(msg.sender, amountWithdrawn);

    return (amountWithdrawn, isRemoved);
  }

  /**
   * @notice  Delegates the voting power of `_attester` at `_instance` to `_delegatee`
   *
   *          Only callable by the `withdrawer` for the given `_attester` at the given
   *          `_instance`.
   *
   * @param _instance   - The address of the rollup instance (or canonical magic address)
   *                    - to which the `_attester` stake is pledged.
   * @param _attester   - The address of the attester to delegate on behalf of
   * @param _delegatee  - The degelegatee that should receive the power
   */
  function delegate(address _instance, address _attester, address _delegatee)
    external
    override(IGSECore)
  {
    require(isRollupRegistered(_instance), Errors.Staking__InstanceDoesNotExist(_instance));
    address withdrawer = instances[_instance].configOf[_attester].withdrawer;
    require(msg.sender == withdrawer, Errors.Staking__NotWithdrawer(withdrawer, msg.sender));
    delegation.delegate(_instance, _attester, _delegatee);
  }

  /**
   * @notice  Votes at the governance using the power delegated to `msg.sender`
   *
   * @param _proposalId - The id of the proposal in the governance to vote on
   * @param _amount     - The amount of voting power to use in the vote
   *                      In the gov, it is possible to do a vote with partial power
   * @param _support    - True if supporting the proposal, false otherwise.
   */
  function vote(uint256 _proposalId, uint256 _amount, bool _support) external override(IGSECore) {
    _vote(msg.sender, _proposalId, _amount, _support);
  }

  /**
   * @notice  Votes at the governance using the power delegated the canonical instance
   *          Only callable by the instance that was canonical at the time of the proposal.
   *
   * @param _proposalId - The id of the proposal in the governance to vote on
   * @param _amount     - The amount of voting power to use in the vote
   *                      In the gov, it is possible to do a vote with partial power
   */
  function voteWithCanonical(uint256 _proposalId, uint256 _amount, bool _support)
    external
    override(IGSECore)
  {
    Timestamp ts = _pendingThrough(_proposalId);
    require(msg.sender == getCanonicalAt(ts), Errors.Staking__NotCanonical(msg.sender));
    _vote(CANONICAL_MAGIC_ADDRESS, _proposalId, _amount, _support);
  }

  function isRollupRegistered(address _instance) public view override(IGSECore) returns (bool) {
    return instances[_instance].exists;
  }

  /**
   * @notice  Lookup if the `_attester` is in the `_instance` attester set
   *
   * @param _instance   - The instance to look at
   * @param _attester   - The attester to lookup
   *
   * @return  True if the `_attester` is in the set of `_instance`, false otherwise
   */
  function isRegistered(address _instance, address _attester)
    public
    view
    override(IGSECore)
    returns (bool)
  {
    return instances[_instance].attesters.contains(_attester);
  }

  /**
   * @notice  Get the address of CURRENT canonical instance
   *
   * @return  The address of the current canonical instance
   */
  function getCanonical() public view override(IGSECore) returns (address) {
    return address(canonical.latest().toUint160());
  }

  /**
   * @notice  Get the address of the instance that was canonical at time `_timestamp`
   *
   * @param _timestamp  - The timestamp to lookup
   *
   * @return  The address of the canonical instance at the time of lookup
   */
  function getCanonicalAt(Timestamp _timestamp) public view override(IGSECore) returns (address) {
    return address(canonical.upperLookup(Timestamp.unwrap(_timestamp).toUint32()).toUint160());
  }

  /**
   * @notice  Inner logic for the vote
   *
   * @dev     Fetches the timestamp where proposal becomes active, and use it for the voting power
   *          of the `_voter`
   *
   * @param _voter      - The voter
   * @param _proposalId - The proposal to vote on
   * @param _amount     - The amount of power to use
   * @param _support    - True to support the proposal, false otherwise
   */
  function _vote(address _voter, uint256 _proposalId, uint256 _amount, bool _support) internal {
    require(_voter != address(0), Errors.GSE__EmptyVoter());
    Timestamp ts = _pendingThrough(_proposalId);
    delegation.usePower(_voter, _proposalId, ts, _amount);
    Governance(owner()).vote(_proposalId, _amount, _support);
  }

  function _pendingThrough(uint256 _proposalId) internal view returns (Timestamp) {
    return Governance(owner()).getProposal(_proposalId).pendingThroughMemory();
  }
}

contract GSE is IGSE, GSECore {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;
  using SafeCast for uint224;
  using Checkpoints for Checkpoints.Trace224;
  using DelegationLib for DelegationData;

  constructor(address __owner, IERC20 _stakingAsset) GSECore(__owner, _stakingAsset) {}

  function getConfig(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (AttesterConfig memory)
  {
    (InstanceStaking storage instanceStaking, bool attesterExists,) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return AttesterConfig({withdrawer: address(0), proposer: address(0)});
    }

    return instanceStaking.configOf[_attester];
  }

  function getWithdrawer(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address withdrawer, bool attesterExists, address instanceAddress)
  {
    InstanceStaking storage instanceStaking;
    (instanceStaking, attesterExists, instanceAddress) =
      _getInstanceStoreWithAttester(_instance, _attester);

    if (!attesterExists) {
      return (address(0), false, address(0));
    }

    return (instanceStaking.configOf[_attester].withdrawer, true, instanceAddress);
  }

  // @todo We are using the proposer function downstream when verifying a propose block, if it have been moved
  // to a new canonical, then we have that the following would end up returning address 0 as the proposer, essentially opening up a
  // attack where anyone can propose in those blocks... Therefore we NEED a way for it to not just be empty in here.
  function getProposer(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address proposer, bool attesterExists, address instanceAddress)
  {
    InstanceStaking storage instanceStaking;
    (instanceStaking, attesterExists, instanceAddress) =
      _getInstanceStoreWithAttester(_instance, _attester);

    return (instanceStaking.configOf[_attester].proposer, true, instanceAddress);
  }

  function balanceOf(address _instance, address _attester) external view returns (uint256) {
    return delegation.getBalanceOf(_instance, _attester);
  }

  function effectiveBalanceOf(address _instance, address _attester) external view returns (uint256) {
    uint256 balance = delegation.getBalanceOf(_instance, _attester);
    if (getCanonical() == _instance) {
      balance += delegation.getBalanceOf(CANONICAL_MAGIC_ADDRESS, _attester);
    }
    return balance;
  }

  function effectiveSupplyOfAt(address _instance, Timestamp _ts) external view returns (uint256) {
    uint256 supply = delegation.getSupplyOf(_instance);
    if (getCanonicalAt(_ts) == _instance) {
      supply += delegation.getSupplyOf(CANONICAL_MAGIC_ADDRESS);
    }
    return supply;
  }

  function supplyOf(address _instance) external view override(IGSE) returns (uint256) {
    return delegation.getSupplyOf(_instance);
  }

  function totalSupply() external view override(IGSE) returns (uint256) {
    return delegation.getSupply();
  }

  function getDelegatee(address _instance, address _attester)
    external
    view
    override(IGSE)
    returns (address)
  {
    return delegation.getDelegatee(_instance, _attester);
  }

  /**
   * @notice  The effective power includes the power delegated to the canonical
   */
  function getEffectiveVotingPowerAt(address _delegatee, Timestamp _timestamp)
    external
    view
    returns (uint256)
  {
    uint256 power = delegation.getVotingPowerAt(_delegatee, _timestamp);
    if (getCanonicalAt(_timestamp) == _delegatee) {
      power += delegation.getVotingPowerAt(CANONICAL_MAGIC_ADDRESS, _timestamp);
    }
    return power;
  }

  function getVotingPower(address _delegatee) external view override(IGSE) returns (uint256) {
    return delegation.getVotingPower(_delegatee);
  }

  function getAttestersAtTime(address _instance, Timestamp _timestamp)
    external
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

  function getAttestersFromIndicesAtTime(
    address _instance,
    Timestamp _timestamp,
    uint256[] memory _indices
  ) external view override(IGSE) returns (address[] memory) {
    return _getAddressFromIndicesAtTimestamp(_instance, _indices, _timestamp);
  }

  function getAttesterFromIndexAtTime(address _instance, uint256 _index, Timestamp _timestamp)
    external
    view
    override(IGSE)
    returns (address)
  {
    uint256[] memory indices = new uint256[](1);
    indices[0] = _index;
    return _getAddressFromIndicesAtTimestamp(_instance, indices, _timestamp)[0];
  }

  function getPowerUsed(address _delegatee, uint256 _proposalId)
    external
    view
    override(IGSE)
    returns (uint256)
  {
    return delegation.getPowerUsed(_delegatee, _proposalId);
  }

  function getVotingPowerAt(address _delegatee, Timestamp _timestamp)
    public
    view
    override(IGSE)
    returns (uint256)
  {
    return delegation.getVotingPowerAt(_delegatee, _timestamp);
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
      } else if (isCanonical) {
        attesters[i] =
          canonicalStore.attesters.getAddressFromIndexAtTimestamp(index - storeSize, ts);
      } else {
        revert Errors.Staking__FatalError("SHOULD NEVER HAPPEN");
      }
    }

    return attesters;
  }

  // @todo I think we can clean this up more, don't think we need the instances being passed around nearly as much now.
  function _getInstanceStoreWithAttester(address _instance, address _attester)
    internal
    view
    returns (InstanceStaking storage store, bool attesterExists, address instanceAddress)
  {
    store = instances[_instance];
    attesterExists = store.attesters.contains(_attester);
    instanceAddress = _instance;

    if (
      !attesterExists && getCanonical() == _instance
        && instances[CANONICAL_MAGIC_ADDRESS].attesters.contains(_attester)
    ) {
      store = instances[CANONICAL_MAGIC_ADDRESS];
      attesterExists = true;
      instanceAddress = CANONICAL_MAGIC_ADDRESS;
    }

    return (store, attesterExists, instanceAddress);
  }
}
