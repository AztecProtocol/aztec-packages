// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Errors} from "./Errors.sol";

/**
 * @notice A struct containing the arguments needed for GSE.deposit(...) function
 * @dev Used to store validator information in the entry queue before they are processed
 */
struct DepositArgs {
  address attester;
  address withdrawer;
  G1Point publicKeyInG1;
  G2Point publicKeyInG2;
  G1Point proofOfPossession;
  bool moveWithLatestRollup;
}

/**
 * @notice A queue data structure for managing validator deposits
 * @dev Implements a FIFO queue using a mapping and two pointers
 * @param validators Mapping from queue index to validator deposit arguments
 * @param first Index of the first element in the queue (head)
 * @param last Index of the next available slot in the queue (tail)
 */
struct StakingQueue {
  mapping(uint256 index => DepositArgs validator) validators;
  uint128 first;
  uint128 last;
}

library StakingQueueLib {
  function init(StakingQueue storage self) internal {
    self.first = 1;
    self.last = 1;
  }

  function enqueue(
    StakingQueue storage self,
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) internal returns (uint256) {
    uint128 queueLocation = self.last;

    self.validators[queueLocation] = DepositArgs({
      attester: _attester,
      withdrawer: _withdrawer,
      publicKeyInG1: _publicKeyInG1,
      publicKeyInG2: _publicKeyInG2,
      proofOfPossession: _proofOfPossession,
      moveWithLatestRollup: _moveWithLatestRollup
    });
    self.last = queueLocation + 1;

    return queueLocation;
  }

  function dequeue(StakingQueue storage self) internal returns (DepositArgs memory validator) {
    require(self.last > self.first, Errors.Staking__QueueEmpty());

    validator = self.validators[self.first];

    self.first += 1;
  }

  function length(StakingQueue storage self) internal view returns (uint256 len) {
    len = self.last - self.first;
  }

  function at(StakingQueue storage self, uint256 index) internal view returns (DepositArgs memory validator) {
    validator = self.validators[self.first + index];
  }
}
