// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ILeonidas} from "@aztec/core/interfaces/ILeonidas.sol";
import {Slot, SlotLib} from "@aztec/core/libraries/TimeMath.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {IGovernanceProposer} from "@aztec/governance/interfaces/IGovernanceProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

/**
 * @notice  A GovernanceProposer implementation following the empire model
 *          Beware that while governance generally do not care about the implementation
 *          this implementation will since it is dependent on the sequencer selection.
 *          This also means that the implementation here will need to be "updated" if
 *          the interfaces of the sequencer selection changes, for example going optimistic.
 */
contract GovernanceProposer is IGovernanceProposer {
  using SlotLib for Slot;

  struct RoundAccounting {
    Slot lastVote;
    IPayload leader;
    bool executed;
    mapping(IPayload proposal => uint256 count) yeaCount;
  }

  uint256 public constant LIFETIME_IN_ROUNDS = 5;

  IRegistry public immutable REGISTRY;
  uint256 public immutable N;
  uint256 public immutable M;

  mapping(address instance => mapping(uint256 roundNumber => RoundAccounting)) public rounds;

  constructor(IRegistry _registry, uint256 _n, uint256 _m) {
    REGISTRY = _registry;
    N = _n;
    M = _m;

    require(N > M / 2, Errors.GovernanceProposer__InvalidNAndMValues(N, M));
    require(N <= M, Errors.GovernanceProposer__NCannotBeLargerTHanM(N, M));
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
  function vote(IPayload _proposal) external override(IGovernanceProposer) returns (bool) {
    require(
      address(_proposal).code.length > 0, Errors.GovernanceProposer__ProposalHaveNoCode(_proposal)
    );

    address instance = REGISTRY.getRollup();
    require(instance.code.length > 0, Errors.GovernanceProposer__InstanceHaveNoCode(instance));

    ILeonidas selection = ILeonidas(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 roundNumber = computeRound(currentSlot);

    RoundAccounting storage round = rounds[instance][roundNumber];

    require(
      currentSlot > round.lastVote, Errors.GovernanceProposer__VoteAlreadyCastForSlot(currentSlot)
    );

    address proposer = selection.getCurrentProposer();
    require(
      msg.sender == proposer, Errors.GovernanceProposer__OnlyProposerCanVote(msg.sender, proposer)
    );

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
  function pushProposal(uint256 _roundNumber) external override(IGovernanceProposer) returns (bool) {
    // Need to ensure that the round is not active.
    address instance = REGISTRY.getRollup();
    require(instance.code.length > 0, Errors.GovernanceProposer__InstanceHaveNoCode(instance));

    ILeonidas selection = ILeonidas(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 currentRound = computeRound(currentSlot);
    require(_roundNumber < currentRound, Errors.GovernanceProposer__CanOnlyPushProposalInPast());
    require(
      _roundNumber + LIFETIME_IN_ROUNDS >= currentRound,
      Errors.GovernanceProposer__ProposalTooOld(_roundNumber, currentRound)
    );

    RoundAccounting storage round = rounds[instance][_roundNumber];
    require(!round.executed, Errors.GovernanceProposer__ProposalAlreadyExecuted(_roundNumber));
    require(
      round.leader != IPayload(address(0)), Errors.GovernanceProposer__ProposalCannotBeAddressZero()
    );
    require(round.yeaCount[round.leader] >= N, Errors.GovernanceProposer__InsufficientVotes());

    round.executed = true;

    emit ProposalPushed(round.leader, _roundNumber);

    require(
      getGovernance().propose(round.leader),
      Errors.GovernanceProposer__FailedToPropose(round.leader)
    );
    return true;
  }

  /**
   * @notice  Fetch the yea count for a specific proposal in a specific round on a specific instance
   *
   * @param _instance - The address of the instance
   * @param _round - The round to lookup
   * @param _proposal - The proposal
   *
   * @return The number of yea votes
   */
  function yeaCount(address _instance, uint256 _round, IPayload _proposal)
    external
    view
    override(IGovernanceProposer)
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
  function computeRound(Slot _slot) public view override(IGovernanceProposer) returns (uint256) {
    return _slot.unwrap() / M;
  }

  function getGovernance() public view override(IGovernanceProposer) returns (IGovernance) {
    return IGovernance(REGISTRY.getGovernance());
  }
}
