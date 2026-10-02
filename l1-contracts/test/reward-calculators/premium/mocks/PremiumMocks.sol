// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface
// solhint-disable no-complex-fallback
// solhint-disable payable-fallback

import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {IATPStaker} from "@test/reward-calculators/IATP.sol";
import {IPremiumATPStaker} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice A withdrawer anyone can deploy: points at any position and claims to have deposited every attester.
 */
contract FakeWithdrawer is IPremiumATPStaker {
  address internal immutable ATP;

  /**
   * @param _atp The position to point at
   */
  constructor(address _atp) {
    ATP = _atp;
  }

  /**
   * @notice Returns the position it was deployed with
   * @return The position
   */
  function getATP() external view override(IATPStaker) returns (address) {
    return ATP;
  }

  /**
   * @notice Claims to have deposited every attester
   * @return Always true
   */
  function isAttester(address) external pure override(IPremiumATPStaker) returns (bool) {
    return true;
  }

  /**
   * @notice Claims no GSE
   * @return Always zero
   */
  function getGSE() external pure override(IPremiumATPStaker) returns (address) {
    return address(0);
  }
}

/**
 * @notice Answers each selector the way a test scripted it, whatever the arguments: a well-formed or malformed word,
 *         a revert, a gas burn, an expensive answer or an answer of any size. Plays any of the withdrawer, position
 *         and provenance source in a probe sequence, so that each probe can be made hostile on its own.
 * @dev An unscripted selector reverts without data.
 */
contract ProbeTarget {
  enum Mode {
    Unset,
    // Returns `word`.
    Answer,
    // Reverts with `word` as 32 bytes of revert data.
    Revert,
    // Burns all the gas it is given.
    Burn,
    // Burns all but 300 of the gas it is given, then returns `word`.
    Expensive,
    // Returns `size` bytes starting with `word`; a large size is a return bomb.
    ReturnSize
  }

  struct Response {
    Mode mode;
    uint256 word;
    uint256 size;
  }

  mapping(bytes4 selector => Response response) internal responses;

  /**
   * @notice Scripts the response to `_selector`
   * @param _selector The selector
   * @param _mode How to respond
   * @param _word The word returned or reverted with
   * @param _size The size of the return data, for `Mode.ReturnSize`
   */
  function setResponse(bytes4 _selector, Mode _mode, uint256 _word, uint256 _size) external {
    responses[_selector] = Response({mode: _mode, word: _word, size: _size});
  }

  /**
   * @notice Scripts `_selector` to return `_word`
   * @param _selector The selector
   * @param _word The address returned
   */
  function answer(bytes4 _selector, address _word) external {
    responses[_selector] = Response({mode: Mode.Answer, word: uint256(uint160(_word)), size: 32});
  }

  /**
   * @notice Scripts `_selector` to return `_word`
   * @param _selector The selector
   * @param _word The bool returned
   */
  function answer(bytes4 _selector, bool _word) external {
    responses[_selector] = Response({mode: Mode.Answer, word: _word ? 1 : 0, size: 32});
  }

  /**
   * @notice Scripts `_selector` to burn all but 300 of its gas, then return `_word`
   * @param _selector The selector
   * @param _word The word returned
   */
  function expensive(bytes4 _selector, uint256 _word) external {
    responses[_selector] = Response({mode: Mode.Expensive, word: _word, size: 32});
  }

  fallback() external {
    Response memory response = responses[msg.sig];
    uint256 mode = uint256(response.mode);
    uint256 word = response.word;
    uint256 size = response.size;
    assembly {
      switch mode
      case 1 {
        mstore(0x00, word)
        return(0x00, 0x20)
      }
      case 2 {
        mstore(0x00, word)
        revert(0x00, 0x20)
      }
      case 3 {
        for {} 1 {} {}
      }
      case 4 {
        for {} gt(gas(), 300) {} {}
        mstore(0x00, word)
        return(0x00, 0x20)
      }
      case 5 {
        mstore(0x00, word)
        return(0x00, size)
      }
      default {
        revert(0, 0)
      }
    }
  }
}

/**
 * @notice Stand-in for a rollup's staking entry points, for tests that need genuine stakers to record attesters
 *         without a real rollup: deposits are queued and never flushed.
 */
contract MockStakingRollup is IHaveVersion {
  using SafeERC20 for IERC20;

  IERC20 internal immutable TOKEN;
  uint256 internal immutable ACTIVATION_THRESHOLD;
  address internal immutable GSE;
  DepositArgs[] internal queue;

  /**
   * @param _token The staking asset
   * @param _activationThreshold The amount each deposit pulls
   * @param _gse The GSE it reports
   */
  constructor(IERC20 _token, uint256 _activationThreshold, address _gse) {
    TOKEN = _token;
    ACTIVATION_THRESHOLD = _activationThreshold;
    GSE = _gse;
  }

  /**
   * @notice Returns the version, always 1
   * @return The version
   */
  function getVersion() external pure override(IHaveVersion) returns (uint256) {
    return 1;
  }

  /**
   * @notice Returns the amount each deposit pulls
   * @return The activation threshold
   */
  function getActivationThreshold() external view returns (uint256) {
    return ACTIVATION_THRESHOLD;
  }

  /**
   * @notice Returns the GSE it was deployed with
   * @return The GSE
   */
  function getGSE() external view returns (address) {
    return GSE;
  }

  /**
   * @notice Pulls one activation threshold from the caller and queues the deposit
   * @param _attester The attester
   * @param _withdrawer The withdrawer
   * @param _publicKeyInG1 The BLS public key in G1
   * @param _publicKeyInG2 The BLS public key in G2
   * @param _proofOfPossession The proof of possession
   * @param _moveWithLatestRollup Whether the stake follows the latest rollup
   */
  function deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external {
    TOKEN.safeTransferFrom(msg.sender, address(this), ACTIVATION_THRESHOLD);
    queue.push(
      DepositArgs({
        attester: _attester,
        withdrawer: _withdrawer,
        publicKeyInG1: _publicKeyInG1,
        publicKeyInG2: _publicKeyInG2,
        proofOfPossession: _proofOfPossession,
        moveWithLatestRollup: _moveWithLatestRollup
      })
    );
  }

  /**
   * @notice Returns the number of queued deposits
   * @return The length of the queue
   */
  function getEntryQueueLength() external view returns (uint256) {
    return queue.length;
  }

  /**
   * @notice Returns a queued deposit
   * @param _index The position in the queue
   * @return The deposit
   */
  function getEntryQueueAt(uint256 _index) external view returns (DepositArgs memory) {
    return queue[_index];
  }
}

/**
 * @notice Stand-in for the rollup registry, resolving every version to one rollup.
 */
contract MockRollupRegistry {
  IHaveVersion internal immutable ROLLUP;

  /**
   * @param _rollup The rollup every version resolves to
   */
  constructor(IHaveVersion _rollup) {
    ROLLUP = _rollup;
  }

  /**
   * @notice Returns the rollup, whatever the version
   * @return The rollup
   */
  function getRollup(uint256) external view returns (IHaveVersion) {
    return ROLLUP;
  }
}
