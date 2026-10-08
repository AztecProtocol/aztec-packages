// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";

/**
 * @title FlushEntryQueue
 * @notice Activates the validators queued on a Rollup, in chunks, until the queue is empty or the epoch's flush
 *         budget is spent. `scripts/forge_broadcast.js` runs it after a deploy that queued `INITIAL_VALIDATORS`.
 * @dev Kept out of the deploy broadcast on purpose. `flushEntryQueue` requires a fixed amount of gas to be left
 *      before every deposit (`StakingLib.getFlushDepositGasFloor`), and forge's on-chain simulation sizes a
 *      transaction at the gas it used times a multiplier, which is too little for a flush of a few entries. This
 *      script is broadcast with `--skip-simulation`, so forge takes its gas limits from `eth_estimateGas`, which
 *      includes the floor. Flushing is permissionless, so any funded key can broadcast it.
 */
contract FlushEntryQueue is Script {
  // Keeps each flush transaction, with forge's gas estimate multiplier, under the per-transaction gas cap under the
  // Glamsterdam gas schedule.
  uint256 internal constant FLUSH_CHUNK_SIZE = 8;

  function run(address _rollup) public {
    IInstance rollup = IInstance(_rollup);
    vm.startBroadcast();
    while (rollup.getEntryQueueLength() > 0 && rollup.getAvailableValidatorFlushes() > 0) {
      rollup.flushEntryQueue(FLUSH_CHUNK_SIZE);
    }
    vm.stopBroadcast();
  }
}
