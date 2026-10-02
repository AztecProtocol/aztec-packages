// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IGSE} from "@aztec/governance/GSE.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IPremiumATPFactory, IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPRegistry} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PremiumATPFactory
 * @author Aztec Labs
 * @notice Creates and funds premium-eligible Aztec Token Positions, and records each one it created in `isATP`, the
 *         provenance a sequencer reward calculator checks before paying a premium.
 *
 * @dev Deploys its own staker and position implementations, so the position implementation accepts initialization
 *      from this factory only. `isATP` is set when a position is created and never cleared or set otherwise, so it
 *      is true exactly for positions this factory created. Every such position reports the factory's registry.
 *
 *      The factory is bound to one GSE, an immutable it passes to its staker implementation, so every staker of its
 *      positions deposits only into rollups on that GSE. A calculator accepts the factory as a provenance source only
 *      if `getGSE()` is the calculator's own GSE: an attester address registers at most once per GSE, not across
 *      GSEs, so a premium for a record on one GSE must not be payable on another (see `PremiumATPStaker`).
 *
 *      Trust roots: minters decide who gets an allocation and how large it is, and the owner decides who mints.
 */
contract PremiumATPFactory is Ownable, IPremiumATPFactory {
  using SafeERC20 for IERC20;

  IERC20 internal immutable TOKEN;
  IGSE internal immutable GSE;
  PremiumATPRegistry internal immutable REGISTRY;
  PremiumATP internal immutable ATP_IMPLEMENTATION;
  PremiumATPStaker internal immutable STAKER_IMPLEMENTATION;

  /// @inheritdoc IPremiumATPFactory
  mapping(address atp => bool created) public override(IPremiumATPFactory) isATP;

  /// @notice Whether an account may create positions.
  mapping(address account => bool allowed) public isMinter;

  /**
   * @notice Emitted when a position is created
   * @param beneficiary The beneficiary
   * @param atp The position
   * @param allocation The allocation
   */
  event ATPCreated(address indexed beneficiary, address indexed atp, uint256 allocation);

  /**
   * @notice Emitted when the owner grants or revokes minting
   * @param minter The account
   * @param allowed Whether it may mint
   */
  event MinterSet(address indexed minter, bool allowed);

  error PremiumATPFactory__NotMinter(address caller);
  error PremiumATPFactory__InvalidGSE(address gse);

  modifier onlyMinter() {
    require(isMinter[msg.sender], PremiumATPFactory__NotMinter(msg.sender));
    _;
  }

  /**
   * @param _owner The owner, also the first minter
   * @param _token The token of the allocations
   * @param _registry The registry of every position
   * @param _rollupRegistry The registry of the rollups stakers may deposit into
   * @param _gse The GSE of the rollups stakers may deposit into, a contract
   * @param _stakingRegistry The provider staking registry stakers may stake through
   */
  constructor(
    address _owner,
    IERC20 _token,
    PremiumATPRegistry _registry,
    IRegistry _rollupRegistry,
    IGSE _gse,
    IStakingRegistry _stakingRegistry
  ) Ownable(_owner) {
    require(address(_gse).code.length > 0, PremiumATPFactory__InvalidGSE(address(_gse)));
    TOKEN = _token;
    GSE = _gse;
    REGISTRY = _registry;
    STAKER_IMPLEMENTATION = new PremiumATPStaker(_token, _rollupRegistry, _gse, _stakingRegistry);
    ATP_IMPLEMENTATION = new PremiumATP(_registry, _token, address(STAKER_IMPLEMENTATION));

    isMinter[_owner] = true;
    emit MinterSet(_owner, true);
  }

  /**
   * @notice Grants or revokes minting
   * @dev Only the owner.
   * @param _minter The account
   * @param _allowed Whether it may mint
   */
  function setMinter(address _minter, bool _allowed) external onlyOwner {
    isMinter[_minter] = _allowed;
    emit MinterSet(_minter, _allowed);
  }

  /**
   * @notice Creates, records and funds a position
   * @dev Only minters. The factory must hold `_allocation` tokens.
   * @param _beneficiary The beneficiary
   * @param _allocation The allocation
   * @return atp The new position
   */
  function createATP(address _beneficiary, uint256 _allocation) external onlyMinter returns (PremiumATP atp) {
    atp = PremiumATP(Clones.clone(address(ATP_IMPLEMENTATION)));
    isATP[address(atp)] = true;
    atp.initialize(_beneficiary, _allocation);
    TOKEN.safeTransfer(address(atp), _allocation);
    emit ATPCreated(_beneficiary, address(atp), _allocation);
  }

  /**
   * @inheritdoc IPremiumATPFactory
   */
  function getRegistry() external view override(IPremiumATPFactory) returns (address) {
    return address(REGISTRY);
  }

  /**
   * @inheritdoc IPremiumATPFactory
   */
  function getGSE() external view override(IPremiumATPFactory) returns (address) {
    return address(GSE);
  }

  /**
   * @notice Returns the token of the allocations
   * @return The token
   */
  function getToken() external view returns (IERC20) {
    return TOKEN;
  }

  /**
   * @notice Returns the position implementation the factory clones
   * @return The implementation
   */
  function getATPImplementation() external view returns (PremiumATP) {
    return ATP_IMPLEMENTATION;
  }

  /**
   * @notice Returns the staker implementation every position clones
   * @return The implementation
   */
  function getStakerImplementation() external view returns (PremiumATPStaker) {
    return STAKER_IMPLEMENTATION;
  }
}
