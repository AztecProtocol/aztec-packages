// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract InboxHarness is Inbox {
  constructor(address _rollup, IERC20 _feeAsset, uint256 _version, uint256 _ringSize)
    Inbox(_rollup, _feeAsset, _version, _ringSize)
  {}

  function getNextMessageIndex() external view returns (uint256) {
    // Compact cumulative index: the next message's index is the count inserted so far.
    return _totalMessagesInserted();
  }

  // Ring surgery for tests that need the sequence counter far from where real sends could take it, such as the
  // sequence type's maximum. Callers are responsible for writing every live ring slot afterwards.
  function setCurrentBucketSeq(uint64 _seq) external {
    currentBucketSeq = _seq;
  }

  function setBucket(uint64 _seq, InboxBucket memory _bucket) external {
    buckets[_seq % BUCKET_RING_SIZE] = _bucket;
  }
}
