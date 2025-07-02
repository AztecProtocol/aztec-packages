// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Errors} from "./Errors.sol";

struct DepositArgs {
  address attester;
  address withdrawer;
  bool onCanonical;
}

struct StakingQueue {
  mapping(uint256 index => DepositArgs validator) validators;
  uint128 first;
  uint128 last;
}

library StakingQueueLib {
  // This is a HARD CAP. We will never attempt to flush more than this number of validators,
  // because it starts to butt up against the block gas limit.
  uint256 public constant MAX_QUEUE_FLUSH_SIZE = 150;

  function init(StakingQueue storage self) internal {
    self.first = 1;
    self.last = 1;
  }

  function enqueue(
    StakingQueue storage self,
    address _attester,
    address _withdrawer,
    bool _onCanonical
  ) internal returns (uint256) {
    uint128 queueLocation = self.last;

    self.validators[queueLocation] =
      DepositArgs({attester: _attester, withdrawer: _withdrawer, onCanonical: _onCanonical});
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

  function getFirst(StakingQueue storage self) internal view returns (uint256) {
    return self.first;
  }

  function getLast(StakingQueue storage self) internal view returns (uint256) {
    return self.last;
  }
}
