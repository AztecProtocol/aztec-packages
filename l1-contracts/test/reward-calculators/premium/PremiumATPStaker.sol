// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {IATPStaker} from "@test/reward-calculators/IATP.sol";
import {IPremiumATP, IPremiumATPStaker, IStakingRegistry} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PremiumATPStaker
 * @author Aztec Labs
 * @notice The staker of a premium-eligible Aztec Token Position (ATP). It stakes only from its position's allocation
 *         and records every attester it deposits, so that a sequencer reward calculator can tell stake funded by the
 *         allocation from any other stake that names this staker as its withdrawer.
 *
 * @dev Security argument. `Rollup.deposit` lets anyone name any withdrawer, so "the GSE withdrawer of an attester is
 *      this staker" says nothing about where its stake came from. What the staker guarantees instead:
 *
 *      1. An attester is recorded only by `stake` or `stakeWithProvider`, and only after the position reserved one
 *         activation threshold of its allocation for it (`IPremiumATP.reserveForStake`, which also sends the tokens
 *         here). The position refuses a reservation beyond `allocation - claimed`, and refuses a claim that would
 *         eat into what is reserved, so `claimed + reserved <= allocation` always holds. Each recorded attester holds
 *         exactly its own reservation (`getStake`), and an attester is recorded at most once, so
 *         `recorded attesters x threshold <= reserved <= allocation - claimed`. With the GSE binding (5), each record
 *         earns a premium for at most one validator, so premium-earning stake never exceeds the allocation, and as
 *         much of the allocation as is earning premiums stays out of the beneficiary's hands.
 *      2. Every exit this staker initiates pays the position, never this contract or the operator: the staker always
 *         names its ATP as the recipient, and an exit initiated by the attester can only be finalized after the
 *         withdrawer (this staker) set a recipient. The position has no sweep, so returning stake stays under the
 *         lock and the reservation.
 *      3. Tokens that reach this contract any other way (a deposit that failed at flush refunds its withdrawer)
 *         can only go to the position (`returnTokensToATP`, permissionless). A refund never frees a reservation.
 *      4. Releasing a record (`release`) is voluntary and only the operator can do it, at any time. It only removes
 *         that attester's premium. It is not tied to the attester's rollup status, because `NONE` also means queued,
 *         moved to another rollup, or fully slashed. A released attester cannot come back through a fresh liquid
 *         deposit: the GSE never lets an attester address register twice on it (its keys are set once and never
 *         cleared, across all of its rollups).
 *      5. The staker is bound to one GSE, its factory's, and deposits only into rollups of the rollup registry that
 *         are on it (`stake` and `stakeWithProvider` revert otherwise). The rule that an attester address registers
 *         at most once holds per GSE only: after a GSE upgrade the registry holds rollups on two GSEs, and the same
 *         address can validate on a rollup of each, naming this staker as its withdrawer on both, since anyone can
 *         name any withdrawer. A calculator accepts a provenance source only if it is bound to the calculator's own
 *         GSE (`PremiumRewardCalculator.setRegistryReward`), and every staker of a factory is bound to the factory's
 *         GSE, so a record earns a premium only on the GSE it was deposited into, against a reservation of that
 *         GSE's activation threshold. A registration of the same address on another GSE, whoever deposited it, is
 *         liquid stake to every calculator that could pay it. Exits stay open on every rollup of the registry, see
 *         `initiateWithdraw`.
 *
 *      An attester that someone else deposited with this staker as withdrawer, from any funds, is not recorded and
 *      earns no premium. If that deposit front-ran the staker's own deposit of the same attester (the keys and proof
 *      of possession are public once the staker's transaction is), the attester is recorded and validating while the
 *      staker's deposit is refunded here: the premium is then backed by the reservation rather than by the deposited
 *      tokens, and the deposited tokens can only exit to the position. Accepted. The GSE's proof of possession binds
 *      neither the attester nor the withdrawer, so the same public keys can also be registered first under another
 *      attester: the staker's deposit then fails at flush and is refunded here, its attester stays recorded but never
 *      validates and earns no premium (the GSE never registers it), and the operator recovers with `returnTokensToATP`,
 *      `release` and a deposit with fresh keys. That only delays the genuine validator.
 *
 *      A slashed attester keeps its record, see `isAttester`.
 *
 *      Trust roots: the token, the rollup registry (only its rollups receive stake), the GSE (only rollups on it
 *      receive stake) and the staking registry are immutables of the implementation, set by the factory. The staker is
 * not upgradeable: an upgradeable staker
 *      would make every implementation its upgrader can install a trust root that must preserve records,
 *      reservations and the no-sweep property, and a calculator could not check that from the staker's own answers.
 *      A production staker that must be upgradeable has to make its upgrade authority such a trust root.
 *
 *      Each position gets an EIP-1167 clone of one implementation, bound once to the position that initializes it.
 *      The implementation itself is bound to a dead address at construction, so it can never be initialized.
 */
contract PremiumATPStaker is IPremiumATPStaker {
  using SafeERC20 for IERC20;

  IERC20 internal immutable TOKEN;
  IRegistry internal immutable ROLLUP_REGISTRY;
  IGSE internal immutable GSE;
  IStakingRegistry internal immutable STAKING_REGISTRY;

  address internal atp;
  mapping(address attester => uint256 amount) internal stakeOf;

  /**
   * @notice Emitted when an attester is recorded
   * @param attester The attester
   * @param rollup The rollup it was deposited into
   * @param amount The reservation it holds
   */
  event AttesterRecorded(address indexed attester, address indexed rollup, uint256 amount);

  /**
   * @notice Emitted when the operator releases an attester
   * @param attester The attester
   * @param amount The reservation freed
   */
  event AttesterReleased(address indexed attester, uint256 amount);

  /**
   * @notice Emitted when tokens held by the staker are returned to the position
   * @param amount The amount returned
   */
  event TokensReturnedToATP(uint256 amount);

  error PremiumATPStaker__AlreadyInitialized();
  error PremiumATPStaker__NotOperator(address caller, address operator);
  error PremiumATPStaker__AlreadyRecorded(address attester);
  error PremiumATPStaker__NotRecorded(address attester);
  error PremiumATPStaker__ZeroActivationThreshold();
  error PremiumATPStaker__UnexpectedEntryQueueLength(uint256 expected, uint256 actual);
  error PremiumATPStaker__UnexpectedWithdrawer(address withdrawer);
  error PremiumATPStaker__RollupOnAnotherGSE(address rollup, address gse);

  modifier onlyOperator() {
    address operator = IPremiumATP(atp).getOperator();
    require(msg.sender == operator, PremiumATPStaker__NotOperator(msg.sender, operator));
    _;
  }

  /**
   * @param _token The staking asset
   * @param _rollupRegistry The registry of the rollups the staker may deposit into
   * @param _gse The GSE of the rollups the staker may deposit into
   * @param _stakingRegistry The provider staking registry
   */
  constructor(IERC20 _token, IRegistry _rollupRegistry, IGSE _gse, IStakingRegistry _stakingRegistry) {
    TOKEN = _token;
    ROLLUP_REGISTRY = _rollupRegistry;
    GSE = _gse;
    STAKING_REGISTRY = _stakingRegistry;
    atp = address(0xdead);
  }

  /**
   * @notice Binds the staker to the caller, its position
   * @dev Callable once. The position calls it in the transaction that creates the clone.
   */
  function initialize() external {
    require(atp == address(0), PremiumATPStaker__AlreadyInitialized());
    atp = msg.sender;
  }

  /**
   * @notice Stakes one activation threshold of the position's allocation for `_attester`, with this staker as the
   *         withdrawer, and records the attester
   * @dev Only the operator. Reserves before depositing, so it reverts if the allocation has no room left. Reverts
   *      if the rollup is not on the staker's GSE.
   * @param _version The rollup version to deposit into
   * @param _attester The attester
   * @param _publicKeyInG1 The attester's BLS public key in G1
   * @param _publicKeyInG2 The attester's BLS public key in G2
   * @param _proofOfPossession The proof of possession of the key
   * @param _moveWithLatestRollup Whether the stake follows the latest rollup
   */
  function stake(
    uint256 _version,
    address _attester,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external onlyOperator {
    IStaking rollup = _getRollupOnGSE(_version);
    uint256 amount = _reserve(rollup);
    _record(_attester, address(rollup), amount);

    TOKEN.forceApprove(address(rollup), amount);
    rollup.deposit(_attester, address(this), _publicKeyInG1, _publicKeyInG2, _proofOfPossession, _moveWithLatestRollup);
  }

  /**
   * @notice Stakes one activation threshold of the position's allocation with a provider's next key, with this
   *         staker as the withdrawer, and records the attester the provider used
   * @dev Only the operator. The staking registry does not return the attester, so the staker reads it from the tail
   *      of the rollup's entry queue, after checking that the call added exactly one entry and that the entry names
   *      this staker as its withdrawer. A staking registry that returns the attester is the preferred production
   *      path: it does not couple the staker to the queue's internals. Reverts if the rollup is not on the staker's
   *      GSE.
   *
   *      Where the premium goes. Sequencer rewards, the premium included, are paid to the coinbase of each
   *      checkpoint, which the proposer's node sets. The staking registry creates a split contract between the
   *      provider and `_userRewardsRecipient`, but nothing in the protocol requires the provider's node to use it as
   *      its coinbase: the premium earned by a provider-run validator reaches the position's side only as far as the
   *      provider is trusted to, exactly like the base sequencer rewards today. The guarantee of this staker is that
   *      the premium is backed by the allocation, not who receives it.
   * @param _version The rollup version to deposit into
   * @param _providerIdentifier The provider
   * @param _expectedProviderTakeRate The provider take rate the operator agreed to
   * @param _userRewardsRecipient The recipient of the user's share of the rewards
   * @param _moveWithLatestRollup Whether the stake follows the latest rollup
   */
  function stakeWithProvider(
    uint256 _version,
    uint256 _providerIdentifier,
    uint16 _expectedProviderTakeRate,
    address _userRewardsRecipient,
    bool _moveWithLatestRollup
  ) external onlyOperator {
    IStaking rollup = _getRollupOnGSE(_version);
    uint256 amount = _reserve(rollup);

    uint256 lengthBefore = rollup.getEntryQueueLength();
    TOKEN.forceApprove(address(STAKING_REGISTRY), amount);
    STAKING_REGISTRY.stake(
      _providerIdentifier,
      _version,
      address(this),
      _expectedProviderTakeRate,
      _userRewardsRecipient,
      _moveWithLatestRollup
    );
    TOKEN.forceApprove(address(STAKING_REGISTRY), 0);

    uint256 lengthAfter = rollup.getEntryQueueLength();
    require(
      lengthAfter == lengthBefore + 1, PremiumATPStaker__UnexpectedEntryQueueLength(lengthBefore + 1, lengthAfter)
    );
    DepositArgs memory entry = rollup.getEntryQueueAt(lengthAfter - 1);
    require(entry.withdrawer == address(this), PremiumATPStaker__UnexpectedWithdrawer(entry.withdrawer));
    _record(entry.attester, address(rollup), amount);
  }

  /**
   * @notice Starts the exit of `_attester`, paying the position when it finalizes
   * @dev Only the operator. Works for any attester whose withdrawer is this staker, recorded or not, and also sets
   *      the position as the recipient of an exit the attester initiated. The record is kept: the attester keeps
   *      earning premiums for checkpoints it proposed until the operator releases it. Unlike the deposit paths, it
   *      accepts a rollup on any GSE: stake that someone else deposited on another GSE naming this staker can only
   *      exit through it, and every exit pays the position, so it cannot move value out of the lock.
   * @param _version The rollup version the attester is on
   * @param _attester The attester
   */
  function initiateWithdraw(uint256 _version, address _attester) external onlyOperator {
    _getRollup(_version).initiateWithdraw(_attester, atp);
  }

  /**
   * @notice Finalizes the exit of `_attester`, which pays the recipient set at initiation, the position
   * @dev Anyone can finalize on the rollup directly; this exists for convenience. Accepts a rollup on any GSE, like
   *      `initiateWithdraw`.
   * @param _version The rollup version the attester is on
   * @param _attester The attester
   */
  function finalizeWithdraw(uint256 _version, address _attester) external {
    _getRollup(_version).finalizeWithdraw(_attester);
  }

  /**
   * @notice Stops recording `_attester` and frees its reservation
   * @dev Only the operator, at any time. The attester earns no premium afterwards.
   * @param _attester A recorded attester
   */
  function release(address _attester) external onlyOperator {
    uint256 amount = stakeOf[_attester];
    require(amount > 0, PremiumATPStaker__NotRecorded(_attester));
    delete stakeOf[_attester];
    IPremiumATP(atp).releaseReservation(amount);
    emit AttesterReleased(_attester, amount);
  }

  /**
   * @notice Sends every token this staker holds to its position
   * @dev Permissionless. Recovers refunds of deposits that failed at flush. Does not change any reservation.
   */
  function returnTokensToATP() external {
    uint256 balance = TOKEN.balanceOf(address(this));
    TOKEN.safeTransfer(atp, balance);
    emit TokensReturnedToATP(balance);
  }

  /**
   * @notice Returns the position this staker belongs to
   * @return The ATP address
   */
  function getATP() external view override(IATPStaker) returns (address) {
    return atp;
  }

  /**
   * @notice Returns the operator of the position
   * @return The operator address
   */
  function getOperator() external view returns (address) {
    return IPremiumATP(atp).getOperator();
  }

  /**
   * @notice Returns whether `_attester` is recorded
   * @dev Slashing does not clear the record: a fully slashed attester whose record remains still authenticates,
   *      so the calculator pays it the premium for checkpoints it proposed before the slash and that are proven
   *      after it (premiums follow state at proof time). It no longer validates, so it proposes nothing new, and its
   *      reservation keeps the allocation locked until the operator releases it; the slashed tokens are lost to the
   *      position.
   * @param _attester The attester
   * @return True if this staker deposited the attester from the allocation and has not released it
   */
  function isAttester(address _attester) external view override(IPremiumATPStaker) returns (bool) {
    return stakeOf[_attester] > 0;
  }

  /**
   * @notice Returns the GSE this staker is bound to
   * @return The GSE address
   */
  function getGSE() external view override(IPremiumATPStaker) returns (address) {
    return address(GSE);
  }

  /**
   * @notice Returns the reservation `_attester` holds
   * @param _attester The attester
   * @return The reserved amount, zero if not recorded
   */
  function getStake(address _attester) external view returns (uint256) {
    return stakeOf[_attester];
  }

  function _record(address _attester, address _rollup, uint256 _amount) internal {
    require(stakeOf[_attester] == 0, PremiumATPStaker__AlreadyRecorded(_attester));
    stakeOf[_attester] = _amount;
    emit AttesterRecorded(_attester, _rollup, _amount);
  }

  function _reserve(IStaking _rollup) internal returns (uint256 amount) {
    amount = _rollup.getActivationThreshold();
    require(amount > 0, PremiumATPStaker__ZeroActivationThreshold());
    IPremiumATP(atp).reserveForStake(amount);
  }

  function _getRollup(uint256 _version) internal view returns (IStaking) {
    return IStaking(address(ROLLUP_REGISTRY.getRollup(_version)));
  }

  function _getRollupOnGSE(uint256 _version) internal view returns (IStaking rollup) {
    rollup = _getRollup(_version);
    address gse = address(rollup.getGSE());
    require(gse == address(GSE), PremiumATPStaker__RollupOnAnotherGSE(address(rollup), gse));
  }
}
