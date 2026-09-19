// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Rollup, RollupBuilder} from "@test/builder/RollupBuilder.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Epoch} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title CheckpointedRandaoTest
 * @notice Differential coverage for the raw checkpointed-randao getter
 *
 * @dev `getCheckpointedRandaoAt` repeats Checkpoints' upper-bound search so it can return the key
 *      alongside the value, which callers relying on when the entropy was revealed need. These
 *      tests pin it to `upperLookup` semantics: the checkpoint with the greatest key at or before
 *      the queried timestamp, and nothing at all when no checkpoint precedes it.
 */
contract CheckpointedRandaoTest is TestBase {
  Rollup internal rollup;
  uint256 internal epochDuration;

  function setUp() public {
    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1)
      .setEpochDuration(4).setSlotDuration(12);
    builder.deploy();
    rollup = builder.getConfig().rollup;
    epochDuration = 4 * 12;
  }

  function _epochStart(uint256 _epoch) internal view returns (uint32) {
    return uint32(Timestamp.unwrap(rollup.getTimestampForEpoch(Epoch.wrap(_epoch))));
  }

  /// @dev Records a checkpoint for the current epoch carrying a recognisable randao.
  function _checkpointAt(uint256 _epoch, uint256 _randao) internal {
    vm.warp(_epochStart(_epoch));
    vm.prevrandao(bytes32(_randao));
    rollup.checkpointRandao();
  }

  function test_returnsNothingBeforeTheFirstCheckpoint() public {
    uint32 genesisTs = _epochStart(0);
    vm.warp(genesisTs + epochDuration);

    (bool exists,,) = rollup.getCheckpointedRandaoAt(Timestamp.wrap(genesisTs - 1));
    assertFalse(exists, "reported a checkpoint before the first one");
  }

  function test_returnsTheGreatestKeyAtOrBeforeTheQuery() public {
    _checkpointAt(3, 0xAAAA);
    _checkpointAt(5, 0xBBBB);
    _checkpointAt(8, 0xCCCC);
    vm.warp(_epochStart(12));

    // Exact hits.
    _assertHit(_epochStart(3), _epochStart(3), 0xAAAA);
    _assertHit(_epochStart(5), _epochStart(5), 0xBBBB);
    _assertHit(_epochStart(8), _epochStart(8), 0xCCCC);

    // Between checkpoints: the query falls back to the preceding one, never forward.
    _assertHit(_epochStart(3) + 1, _epochStart(3), 0xAAAA);
    _assertHit(_epochStart(5) - 1, _epochStart(3), 0xAAAA);
    _assertHit(_epochStart(7), _epochStart(5), 0xBBBB);

    // After the last checkpoint.
    _assertHit(_epochStart(12), _epochStart(8), 0xCCCC);

    // Before every checkpoint but the genesis one pushed by initialize.
    (bool exists, uint32 keyTs,) = rollup.getCheckpointedRandaoAt(Timestamp.wrap(_epochStart(1)));
    assertTrue(exists, "genesis checkpoint missing");
    assertEq(keyTs, _epochStart(0), "did not fall back to the genesis checkpoint");
  }

  function test_revertsOnAFutureTimestamp() public {
    _checkpointAt(3, 0xAAAA);

    uint32 future = uint32(block.timestamp + 1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.ValidatorSelection__RandaoNotStable.selector, future, uint32(block.timestamp))
    );
    rollup.getCheckpointedRandaoAt(Timestamp.wrap(future));
  }

  /// @dev A second call in the same epoch must not overwrite the value already recorded for it.
  function test_keepsTheFirstCheckpointOfAnEpoch() public {
    _checkpointAt(3, 0xAAAA);

    vm.warp(_epochStart(3) + 12);
    vm.prevrandao(bytes32(uint256(0xDDDD)));
    rollup.checkpointRandao();

    _assertHit(_epochStart(3), _epochStart(3), 0xAAAA);
  }

  function _assertHit(uint32 _queryTs, uint32 _expectedKey, uint256 _expectedRandao) internal view {
    (bool exists, uint32 keyTs, uint224 randao) = rollup.getCheckpointedRandaoAt(Timestamp.wrap(_queryTs));
    assertTrue(exists, "no checkpoint found");
    assertEq(keyTs, _expectedKey, "wrong checkpoint key");
    assertEq(uint256(randao), _expectedRandao, "wrong randao value");
  }
}
