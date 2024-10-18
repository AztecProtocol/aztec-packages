// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";
import {IGerousia} from "@aztec/governance/interfaces/IGerousia.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

import {Slot, SlotLib} from "@aztec/core/libraries/TimeMath.sol";
import {ILeonidas} from "@aztec/core/interfaces/ILeonidas.sol";

/**
 * @notice  A Gerousia implementation following the empire model
 *          Beware that while governance generally do not care about the implementation
 *          this implementation will since it is dependent on the sequencer selection.
 *          This also means that the implementation here will need to be "updated" if
 *          the interfaces of the sequencer selection changes, for exampel going optimistic.
 */
contract Gerousia is IGerousia {
  using SlotLib for Slot;

  struct RoundAccounting {
    Slot lastVote;
    address leader;
    bool executed;
    mapping(address proposal => uint256 count) yeaCount;
  }

  uint256 public constant LIFETIME_IN_ROUNDS = 5;

  IApella public immutable APELLA;
  IRegistry public immutable REGISTRY;
  uint256 public immutable N;
  uint256 public immutable M;

  mapping(address instance => mapping(uint256 roundNumber => RoundAccounting)) public rounds;

  constructor(IApella _apella, IRegistry _registry, uint256 _n, uint256 _m) {
    APELLA = _apella;
    REGISTRY = _registry;
    N = _n;
    M = _m;

    require(N > M / 2, Errors.Gerousia__InvalidNAndMValues(N, M));
    require(N <= M, Errors.Gerousia__NCannotBeLargerTHanM(N, M));
  }

  // Note that this one is heavily realying on the fact that this contract
  // could be updated at the same time as another upgrade is made.

  /**
   * @notice	Cast a vote on a proposal
   *					Note that this is assuming that the canonical rollup will cast it as
   * 					part of block production, we will perform it here
   *
   * @param _proposal - The proposal to cast a vote on
   *
   * @return True if executed successfully, false otherwise
   */
  function vote(address _proposal) external override(IGerousia) returns (bool) {
    require(_proposal.code.length > 0, Errors.Gerousia__ProposalHaveNoCode(_proposal));

    address instance = REGISTRY.getRollup();
    require(instance.code.length > 0, Errors.Gerousia__InstanceHaveNoCode(instance));

    ILeonidas selection = ILeonidas(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 roundNumber = computeRound(currentSlot);

    RoundAccounting storage round = rounds[instance][roundNumber];

    require(currentSlot > round.lastVote, Errors.Gerousia__VoteAlreadyCastForSlot(currentSlot));

    address proposer = selection.getCurrentProposer();
    require(msg.sender == proposer, Errors.Gerousia__OnlyProposerCanVote(msg.sender, proposer));

    round.yeaCount[_proposal] += 1;
    round.lastVote = currentSlot;

    // @todo We can optimise here for gas by storing some of it packed with the leader.
    if (round.leader != _proposal && round.yeaCount[_proposal] > round.yeaCount[round.leader]) {
      round.leader = _proposal;
    }

    emit VoteCast(_proposal, roundNumber, msg.sender);

    return true;
  }

  /**
   * @notice  Push the proposal to the appela
   *
   * @param _roundNumber - The round number to execute
   *
   * @return True if executed successfully, false otherwise
   */
  function pushProposal(uint256 _roundNumber) external override(IGerousia) returns (bool) {
    // Need to ensure that the round is not active.
    address instance = REGISTRY.getRollup();
    require(instance.code.length > 0, Errors.Gerousia__InstanceHaveNoCode(instance));

    ILeonidas selection = ILeonidas(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 currentRound = computeRound(currentSlot);
    require(_roundNumber < currentRound, Errors.Gerousia__CanOnlyPushProposalInPast());
    require(
      _roundNumber + LIFETIME_IN_ROUNDS >= currentRound,
      Errors.Gerousia__ProposalTooOld(_roundNumber)
    );

    RoundAccounting storage round = rounds[instance][_roundNumber];
    require(!round.executed, Errors.Gerousia__ProposalAlreadyExecuted(_roundNumber));
    require(round.leader != address(0), Errors.Gerousia__ProposalCannotBeAddressZero());
    require(round.yeaCount[round.leader] >= N, Errors.Gerousia__InsufficientVotes());

    round.executed = true;

    emit ProposalPushed(round.leader, _roundNumber);

    require(APELLA.propose(round.leader), Errors.Gerousia__FailedToPropose(round.leader));
    return true;
  }

  /**
   * @notice  Fetch the yea count for a specific proposal in a specific round on a specific instance
   *
   * @param _instance - The address of the instance
   * @param _round - The round to lookup
   * @param _proposal - The address of the proposal
   *
   * @return The number of yea votes
   */
  function yeaCount(address _instance, uint256 _round, address _proposal)
    external
    view
    override(IGerousia)
    returns (uint256)
  {
    return rounds[_instance][_round].yeaCount[_proposal];
  }

  /**
   * @notice  Computes the round at the given slot
   *
   * @param _slot - The slot to compute round for
   *
   * @return The round number
   */
  function computeRound(Slot _slot) public view override(IGerousia) returns (uint256) {
    return _slot.unwrap() / M;
  }
}
