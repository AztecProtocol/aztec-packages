// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface
// solhint-disable no-complex-fallback
// solhint-disable payable-fallback

import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

/// @notice Pays a configured reward to listed proposers and the default to everyone else.
contract TableCalculator is ISequencerRewardCalculator {
  struct Entry {
    bool exists;
    uint256 reward;
  }

  mapping(address proposer => Entry) public entries;

  function setReward(address _proposer, uint256 _reward) external {
    entries[_proposer] = Entry({exists: true, reward: _reward});
  }

  function getSequencerRewards(Epoch, address[] calldata _proposers, uint256 _defaultReward, uint256)
    external
    view
    override(ISequencerRewardCalculator)
    returns (uint256[] memory rewards)
  {
    rewards = new uint256[](_proposers.length);
    for (uint256 i = 0; i < _proposers.length; i++) {
      Entry memory entry = entries[_proposers[i]];
      rewards[i] = entry.exists ? entry.reward : _defaultReward;
    }
  }
}

/// @notice Returns a configured list of rewards, whatever the input. A list of the wrong length is malformed.
contract ListCalculator is ISequencerRewardCalculator {
  uint256[] internal values;

  constructor(uint256[] memory _values) {
    values = _values;
  }

  function setValues(uint256[] memory _values) external {
    values = _values;
  }

  function getSequencerRewards(Epoch, address[] calldata, uint256, uint256)
    external
    view
    override(ISequencerRewardCalculator)
    returns (uint256[] memory)
  {
    return values;
  }
}

/// @notice Answers every call with configured raw bytes, to exercise the response shape checks.
contract RawReturnCalculator {
  bytes internal data;

  constructor(bytes memory _data) {
    data = _data;
  }

  fallback() external {
    bytes memory response = data;
    assembly {
      return(add(response, 0x20), mload(response))
    }
  }
}

/// @notice Reverts with `REVERT_SIZE` bytes of revert data.
contract RevertingCalculator {
  uint256 public immutable REVERT_SIZE;

  constructor(uint256 _revertSize) {
    REVERT_SIZE = _revertSize;
  }

  fallback() external {
    uint256 size = REVERT_SIZE;
    assembly {
      revert(0, size)
    }
  }
}

/// @notice Loops until it runs out of gas.
contract GasBurningCalculator {
  fallback() external {
    assembly {
      for {} 1 {} {}
    }
  }
}

/// @notice Succeeds with `RETURN_SIZE` bytes of zeroed return data, paying the memory expansion from its stipend.
contract ReturnBombCalculator {
  uint256 public immutable RETURN_SIZE;

  constructor(uint256 _returnSize) {
    RETURN_SIZE = _returnSize;
  }

  fallback() external {
    uint256 size = RETURN_SIZE;
    assembly {
      return(0, size)
    }
  }
}

/// @notice Writes storage before answering with the default for every entry, which fails under `staticcall`.
contract StateModifyingCalculator {
  uint256 public calls;

  fallback(bytes calldata _input) external returns (bytes memory) {
    calls++;
    (, address[] memory proposers, uint256 defaultReward,) =
      abi.decode(_input[4:], (Epoch, address[], uint256, uint256));
    uint256[] memory rewards = new uint256[](proposers.length);
    for (uint256 i = 0; i < rewards.length; i++) {
      rewards[i] = defaultReward;
    }
    return abi.encode(rewards);
  }
}

/// @notice Answers every entry with the gas it had on entry, so a caller can observe the stipend it was given.
/// @dev Implemented as a bare fallback so that `gas()` is read a few opcodes after the call starts.
contract GasReportingCalculator {
  fallback() external {
    assembly {
      let observed := gas()
      let count := calldataload(add(4, calldataload(0x24)))
      mstore(0x00, 0x20)
      mstore(0x20, count)
      for { let i := 0 } lt(i, count) { i := add(i, 1) } {
        mstore(add(0x40, shl(5, i)), observed)
      }
      return(0x00, add(0x40, shl(5, count)))
    }
  }
}
