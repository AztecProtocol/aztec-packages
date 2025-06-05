// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

struct Queue {
  mapping(uint256 index => address addr) attester;
  mapping(address attester => bool) seen;
  uint256 first;
  uint256 last;
}

library QueueLib {
  error AlreadySeen(address _attester);

  function init(Queue storage self) internal {
    self.first = 1;
    self.last = 1;
  }

  function enqueue(Queue storage self, address _attester) internal {
    require(!self.seen[_attester], AlreadySeen(_attester));

    self.attester[self.last] = _attester;
    self.seen[_attester] = true;
    self.last += 1;
  }

  function dequeue(Queue storage self) internal returns (address attester) {
    require(self.last > self.first);

    attester = self.attester[self.first];

    delete self.seen[attester];

    self.first += 1;
  }

  function length(Queue storage self) internal view returns (uint256 len) {
    len = self.last - self.first;
  }
}
