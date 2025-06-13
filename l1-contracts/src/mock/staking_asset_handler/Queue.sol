// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

struct Queue {
  mapping(uint256 index => address addr) attester;
  mapping(address attester => bool) inQueue;
  uint256 first;
  uint256 last;
}

library QueueLib {
  error AlreadySeen(address _attester);
  error QueueEmpty();

  function init(Queue storage self) internal {
    self.first = 1;
    self.last = 1;
  }

  function enqueue(Queue storage self, address _attester) internal returns (uint256) {
    require(!self.inQueue[_attester], AlreadySeen(_attester));

    uint256 queueLocation = self.last;

    self.attester[queueLocation] = _attester;
    self.inQueue[_attester] = true;
    self.last += 1;

    return queueLocation;
  }

  function dequeue(Queue storage self) internal returns (address attester) {
    require(self.last > self.first, QueueEmpty());

    attester = self.attester[self.first];

    delete self.inQueue[attester];

    self.first += 1;
  }

  function length(Queue storage self) internal view returns (uint256 len) {
    len = self.last - self.first;
  }

  function isInQueue(Queue storage self, address _attester) internal view returns (bool) {
    return self.inQueue[_attester];
  }

  function getFirst(Queue storage self) internal view returns (uint256) {
    return self.first;
  }

  function getLast(Queue storage self) internal view returns (uint256) {
    return self.last;
  }
}
