// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {IEmpire, IEmporer} from "@aztec/governance/interfaces/IEmpire.sol";
import {Slot} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";

/**
 * @notice  A GovernanceProposer implementation following the empire model
 *          Beware that while governance generally do not care about the implementation
 *          this implementation will since it is dependent on the sequencer selection.
 *          This also means that the implementation here will need to be "updated" if
 *          the interfaces of the sequencer selection changes, for example going optimistic.
 */
abstract contract EmpireBase is EIP712, IEmpire {
  using SignatureLib for Signature;

  struct RoundAccounting {
    Slot lastVote;
    IPayload leader;
    bool executed;
    mapping(IPayload proposal => uint256 count) yeaCount;
  }

  uint256 public constant LIFETIME_IN_ROUNDS = 5;
  // EIP-712 type hash for the Vote struct
  bytes32 public constant VOTE_TYPEHASH = keccak256("Vote(address proposal)");

  // The quorum size
  uint256 public immutable N;
  // The round size
  uint256 public immutable M;

  mapping(address instance => mapping(uint256 roundNumber => RoundAccounting)) public rounds;

  constructor(uint256 _n, uint256 _m) EIP712("EmpireBase", "1") {
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
  function vote(IPayload _proposal) external override(IEmpire) returns (bool) {
    return _internalVote(_proposal, Signature({v: 0, r: bytes32(0), s: bytes32(0)}));
  }

  /**
   * @notice	Cast a vote on a proposal
   *					Note that this is assuming that the canonical rollup will cast it as
   * 					part of block production, we will perform it here
   *
   * @param _proposal - The proposal to cast a vote on
   * @param _sig - A signature from the proposer
   *
   * @return True if executed successfully, false otherwise
   */
  function voteWithSig(IPayload _proposal, Signature memory _sig)
    external
    override(IEmpire)
    returns (bool)
  {
    return _internalVote(_proposal, _sig);
  }

  /**
   * @notice  Executes the proposal using the `_execute` function
   *
   * @param _roundNumber - The round number to execute
   *
   * @return True if executed successfully, false otherwise
   */
  function executeProposal(uint256 _roundNumber) external override(IEmpire) returns (bool) {
    // Need to ensure that the round is not active.
    address instance = getInstance();
    require(instance.code.length > 0, Errors.GovernanceProposer__InstanceHaveNoCode(instance));

    IEmporer selection = IEmporer(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 currentRound = computeRound(currentSlot);
    require(_roundNumber < currentRound, Errors.GovernanceProposer__CanOnlyExecuteProposalInPast());
    require(
      _roundNumber + LIFETIME_IN_ROUNDS >= currentRound,
      Errors.GovernanceProposer__ProposalTooOld(_roundNumber, currentRound)
    );

    RoundAccounting storage round = rounds[instance][_roundNumber];
    require(!round.executed, Errors.GovernanceProposer__ProposalAlreadyExecuted(_roundNumber));
    require(
      round.leader != IPayload(address(0)), Errors.GovernanceProposer__ProposalCannotBeAddressZero()
    );
    uint256 votesCast = round.yeaCount[round.leader];
    require(votesCast >= N, Errors.GovernanceProposer__InsufficientVotes(votesCast, N));

    round.executed = true;

    emit ProposalExecuted(round.leader, _roundNumber);

    require(_execute(round.leader), Errors.GovernanceProposer__FailedToPropose(round.leader));
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
    override(IEmpire)
    returns (uint256)
  {
    return rounds[_instance][_round].yeaCount[_proposal];
  }

  /**
   * @notice  Computes the round at the current slot
   *
   * @return The round number
   */
  function getCurrentRound() external view returns (uint256) {
    IEmporer selection = IEmporer(getInstance());
    Slot currentSlot = selection.getCurrentSlot();
    return computeRound(currentSlot);
  }

  /**
   * @notice  Computes the round at the given slot
   *
   * @param _slot - The slot to compute round for
   *
   * @return The round number
   */
  function computeRound(Slot _slot) public view override(IEmpire) returns (uint256) {
    return Slot.unwrap(_slot) / M;
  }

  // Virtual functions
  function getInstance() public view virtual override(IEmpire) returns (address);
  function getExecutor() public view virtual override(IEmpire) returns (address);
  function _execute(IPayload _proposal) internal virtual returns (bool);

  function _internalVote(IPayload _proposal, Signature memory _sig) internal returns (bool) {
    address instance = getInstance();
    require(instance.code.length > 0, Errors.GovernanceProposer__InstanceHaveNoCode(instance));

    IEmporer selection = IEmporer(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 roundNumber = computeRound(currentSlot);

    RoundAccounting storage round = rounds[instance][roundNumber];

    require(
      currentSlot > round.lastVote, Errors.GovernanceProposer__VoteAlreadyCastForSlot(currentSlot)
    );

    address proposer = selection.getCurrentProposer();

    if (_sig.isEmpty()) {
      require(
        msg.sender == proposer, Errors.GovernanceProposer__OnlyProposerCanVote(msg.sender, proposer)
      );
    } else {
      bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOTE_TYPEHASH, _proposal)));

      // _sig.verify will throw if invalid, it is more my sanity that I am doing this for.
      require(
        _sig.verify(proposer, digest),
        Errors.GovernanceProposer__OnlyProposerCanVote(msg.sender, proposer)
      );
    }

    round.yeaCount[_proposal] += 1;
    round.lastVote = currentSlot;

    // @todo We can optimise here for gas by storing some of it packed with the leader.
    if (round.leader != _proposal && round.yeaCount[_proposal] > round.yeaCount[round.leader]) {
      round.leader = _proposal;
    }

    emit VoteCast(_proposal, roundNumber, msg.sender);

    if (round.yeaCount[_proposal] == N) {
      emit ProposalExecutable(_proposal, roundNumber);
    }

    return true;
  }
}
