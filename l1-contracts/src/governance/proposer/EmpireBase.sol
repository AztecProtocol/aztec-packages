// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {SignatureLib, Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {IEmpire, IEmperor} from "@aztec/governance/interfaces/IEmpire.sol";
import {Slot} from "@aztec/shared/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {CompressedTimeMath, CompressedSlot} from "@aztec/shared/libraries/CompressedTimeMath.sol";

struct RoundAccounting {
  Slot lastSignalSlot;
  IPayload payloadWithMostSignals;
  bool executed;
}

struct CompressedRoundAccounting {
  CompressedSlot lastSignalSlot;
  IPayload payloadWithMostSignals;
  bool executed;
  mapping(IPayload payload => uint256 count) signalCount;
}

/**
 * @title EmpireBase
 * @author Aztec Labs
 * @notice Abstract base contract for a round-based signaling system where designated entities
 *         signal support for payloads before they are submitted elsewhere.
 *         Works with an IEmperor (i.e. a Rollup) contract to determine the entity that may signal for a given slot.
 *
 * @dev PURPOSE:
 * This contract allows validators to signal their support for payloads.
 *
 * There are two primary implementations of this contract:
 * - The GovernanceProposer
 * - The EmpireSlashingProposer
 *
 * The GovernanceProposer is used to signal support for payloads before they are submitted to the main Governance
 * contract,
 * resulting in a two-stage governance process:
 * 1. Signal gathering (GovernanceProposer contract) - validators indicate support
 * 2. Formal governance (Governance contract) - actual voting and execution
 *
 * The EmpireSlashingProposer is used to signal support for payloads before they are submitted to a Rollup instance's
 * Slasher,
 * resulting in a one-stage slashing process:
 * 1. Signal gathering (EmpireSlashingProposer contract) - validators indicate support
 *
 * @dev KEY CONCEPTS:
 * **Payload**: A contract with a list of actions (contract calls) to perform.
 *
 * **Rounds**: Time is divided into rounds of ROUND_SIZE slots. Payloads compete for support
 * within a round.
 *
 * **Instances**: Refers to an instance of the rollup contract, which in this case is exposed via a simplified IEmperor
 * interface.
 * This contract only needs the instance to determine the current slot (to compute the round), and the current block
 * proposer.
 *
 * **Signalers**: Each slot has a designated signaler (determined by IEmperor).
 * Only the current slot's signaler can signal support, either directly or via signature.
 * In the current implementation, the entity that may propose a block (i.e. the "proposer") is the signaler.
 *
 * **Signaling**
 * - One signal per slot (enforced by tracking lastSignalSlot)
 * - Signals accumulate for payloads within a round
 * - First payload to reach QUORUM_SIZE becomes submittable
 *
 * **Submission**
 * - Payloads can be submitted after their round ends with `submitRoundWinner(uint256 _roundNumber)`
 * - Round winner must have received at least QUORUM_SIZE signals
 * - Submission window: LIFETIME_IN_ROUNDS (5 rounds)
 * - Each round's leading payload can only be submitted once
 * - `_handleRoundWinner(IPayload _payload)` on the implementing contract is called to handle the winner
 *
 * @dev SYSTEM PARAMETERS:
 * - QUORUM_SIZE: Minimum signals needed for submission
 * - ROUND_SIZE: Slots per round
 * - Constraint: QUORUM_SIZE > ROUND_SIZE/2 and QUORUM_SIZE ≤ ROUND_SIZE
 * Note that it it possible to have QUORUM_SIZE = 1 for ROUND_SIZE = 1, which effectively give all the
 * power to the first signal.
 *
 * @dev SIGNALING METHODS:
 * 1. Direct signal: Current signaler calls `signal()`
 * 2. Delegated signal: Anyone submits with signaler's signature via `signalWithSig()`
 *    - Uses EIP-712 for signature verification
 *    - Includes slot and instance to prevent replay attacks
 *
 * @dev ABSTRACT FUNCTIONS:
 * Implementing contracts must provide:
 * - `getInstance()`: Returns the IEmperor instance for slot/signaler info
 * - `_handleRoundWinner(IPayload _payload)`: Called during `submitRoundWinner`
 *
 * Note this contract can support multiple instances/rollups. This is because the instance is retrieved dynamically from
 * the
 * underlying implementation. For example, when the GovernanceProposer is used, the instance is the canonical rollup,
 * which will change whenever there is a new canonical rollup.
 *
 * This also means that if the new canonical rollup does not support the IEmperor interface, this contract will not
 * work,
 * and a different implementation will need to be specified as part of the payload which deploys the new canonical
 * instance.
 */
abstract contract EmpireBase is EIP712, IEmpire {
  using SignatureLib for Signature;
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for CompressedSlot;

  // EIP-712 type hash for the Signal struct
  bytes32 public constant SIGNAL_TYPEHASH = keccak256("Signal(address payload,uint256 slot,address instance)");

  // The number of signals needed for a payload to be considered submittable.
  uint256 public immutable QUORUM_SIZE;
  // The number of slots per round.
  uint256 public immutable ROUND_SIZE;
  // The number of rounds that a round winner may be submitted for, after it have passed.
  uint256 public immutable LIFETIME_IN_ROUNDS;
  // The number of rounds that must elapse before a round winner may be submitted.
  uint256 public immutable EXECUTION_DELAY_IN_ROUNDS;

  // Mapping of instance to round number to round accounting.
  mapping(address instance => mapping(uint256 roundNumber => CompressedRoundAccounting)) internal rounds;

  constructor(uint256 _quorumSize, uint256 _roundSize, uint256 _lifetimeInRounds, uint256 _executionDelayInRounds)
    EIP712("EmpireBase", "1")
  {
    QUORUM_SIZE = _quorumSize;
    ROUND_SIZE = _roundSize;
    LIFETIME_IN_ROUNDS = _lifetimeInRounds;
    EXECUTION_DELAY_IN_ROUNDS = _executionDelayInRounds;

    require(QUORUM_SIZE > ROUND_SIZE / 2, Errors.EmpireBase__InvalidQuorumAndRoundSize(QUORUM_SIZE, ROUND_SIZE));
    require(QUORUM_SIZE <= ROUND_SIZE, Errors.EmpireBase__QuorumCannotBeLargerThanRoundSize(QUORUM_SIZE, ROUND_SIZE));

    require(
      LIFETIME_IN_ROUNDS > EXECUTION_DELAY_IN_ROUNDS,
      Errors.EmpireBase__InvalidLifetimeAndExecutionDelay(LIFETIME_IN_ROUNDS, EXECUTION_DELAY_IN_ROUNDS)
    );
  }

  /**
   * @notice	Signal support for a payload
   *
   * @dev this only works if msg.sender is the current signaler
   *
   * @param _payload - The address of the IPayload to signal support for
   *
   * @return True if executed successfully, false otherwise
   */
  function signal(IPayload _payload) external override(IEmpire) returns (bool) {
    return _internalSignal(_payload, Signature({v: 0, r: bytes32(0), s: bytes32(0)}));
  }

  /**
   * @notice	Signal support for a payload with a signature from the current signaler
   *
   * @param _payload - The payload to signal support for
   * @param _sig - A signature from the signaler
   *
   * @return True if executed successfully, false otherwise
   */
  function signalWithSig(IPayload _payload, Signature memory _sig) external override(IEmpire) returns (bool) {
    return _internalSignal(_payload, _sig);
  }

  /**
   * @notice  Submit the round winner to the implementation's `_handleRoundWinner` function
   *
   * @dev calls `_handleRoundWinner` on the implementing contract with the winning payload, if applicable.
   *
   * @param _roundNumber - The round number to execute
   *
   * @return True if executed successfully, false otherwise
   */
  function submitRoundWinner(uint256 _roundNumber) external override(IEmpire) returns (bool) {
    // Need to ensure that the round is not active.
    address instance = getInstance();
    require(instance.code.length > 0, Errors.EmpireBase__InstanceHaveNoCode(instance));

    IEmperor selection = IEmperor(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 currentRound = computeRound(currentSlot);

    require(
      currentRound > _roundNumber + EXECUTION_DELAY_IN_ROUNDS,
      Errors.EmpireBase__RoundTooNew(_roundNumber, currentRound)
    );

    require(
      currentRound <= _roundNumber + LIFETIME_IN_ROUNDS, Errors.EmpireBase__RoundTooOld(_roundNumber, currentRound)
    );

    CompressedRoundAccounting storage round = rounds[instance][_roundNumber];
    require(!round.executed, Errors.EmpireBase__PayloadAlreadySubmitted(_roundNumber));

    // If the payload with the most signals is address(0) there are nothing to execute and it is a no-op.
    // This will be the case if no signals have been cast during a round, or if people have simple signalled
    // for nothing to happen (the same as not signalling).
    require(round.payloadWithMostSignals != IPayload(address(0)), Errors.EmpireBase__PayloadCannotBeAddressZero());
    uint256 signalsCast = round.signalCount[round.payloadWithMostSignals];
    require(signalsCast >= QUORUM_SIZE, Errors.EmpireBase__InsufficientSignals(signalsCast, QUORUM_SIZE));

    round.executed = true;

    emit PayloadSubmitted(round.payloadWithMostSignals, _roundNumber);

    require(
      _handleRoundWinner(round.payloadWithMostSignals),
      Errors.EmpireBase__FailedToSubmitRoundWinner(round.payloadWithMostSignals)
    );
    return true;
  }

  /**
   * @notice  Fetch the signal count for a specific payload in a specific round on a specific instance
   *
   * @param _instance - The address of the instance
   * @param _round - The round to lookup
   * @param _payload - The payload to lookup
   *
   * @return The number of signals
   */
  function signalCount(address _instance, uint256 _round, IPayload _payload)
    external
    view
    override(IEmpire)
    returns (uint256)
  {
    return rounds[_instance][_round].signalCount[_payload];
  }

  /**
   * @notice  Computes the round at the current slot
   *
   * @return The round number
   */
  function getCurrentRound() external view returns (uint256) {
    IEmperor selection = IEmperor(getInstance());
    Slot currentSlot = selection.getCurrentSlot();
    return computeRound(currentSlot);
  }

  function getRoundData(address _instance, uint256 _round) external view returns (RoundAccounting memory) {
    CompressedRoundAccounting storage compressedRound = rounds[_instance][_round];
    return RoundAccounting({
      lastSignalSlot: compressedRound.lastSignalSlot.decompress(),
      payloadWithMostSignals: compressedRound.payloadWithMostSignals,
      executed: compressedRound.executed
    });
  }

  /**
   * @notice Computes the round at the given slot
   *
   * @param _slot - The slot to compute round for
   *
   * @return The round number
   */
  function computeRound(Slot _slot) public view override(IEmpire) returns (uint256) {
    return Slot.unwrap(_slot) / ROUND_SIZE;
  }

  function getSignalSignatureDigest(IPayload _payload, Slot _slot) public view returns (bytes32) {
    return _hashTypedDataV4(keccak256(abi.encode(SIGNAL_TYPEHASH, _payload, _slot, getInstance())));
  }

  // Virtual functions
  function getInstance() public view virtual override(IEmpire) returns (address);
  function _handleRoundWinner(IPayload _payload) internal virtual returns (bool);

  function _internalSignal(IPayload _payload, Signature memory _sig) internal returns (bool) {
    address instance = getInstance();
    require(instance.code.length > 0, Errors.EmpireBase__InstanceHaveNoCode(instance));

    IEmperor selection = IEmperor(instance);
    Slot currentSlot = selection.getCurrentSlot();

    uint256 roundNumber = computeRound(currentSlot);

    CompressedRoundAccounting storage round = rounds[instance][roundNumber];

    // Ensure that time have progressed since the last slot. If not, the current proposer might send multiple signals
    require(currentSlot > round.lastSignalSlot.decompress(), Errors.EmpireBase__SignalAlreadyCastForSlot(currentSlot));
    round.lastSignalSlot = currentSlot.compress();

    address signaler = selection.getCurrentProposer();

    if (_sig.isEmpty()) {
      require(msg.sender == signaler, Errors.EmpireBase__OnlyProposerCanSignal(msg.sender, signaler));
    } else {
      bytes32 digest = getSignalSignatureDigest(_payload, currentSlot);

      // _sig.verify will throw if invalid, it is more my sanity that I am doing this for.
      require(_sig.verify(signaler, digest), Errors.EmpireBase__OnlyProposerCanSignal(msg.sender, signaler));
    }

    round.signalCount[_payload] += 1;

    if (
      round.payloadWithMostSignals != _payload
        && round.signalCount[_payload] > round.signalCount[round.payloadWithMostSignals]
    ) {
      round.payloadWithMostSignals = _payload;
    }

    emit SignalCast(_payload, roundNumber, signaler);

    if (round.signalCount[_payload] == QUORUM_SIZE) {
      emit PayloadSubmittable(_payload, roundNumber);
    }

    return true;
  }
}
