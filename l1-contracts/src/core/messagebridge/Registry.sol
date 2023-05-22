// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {IRegistry} from "@aztec/core/interfaces/messagebridge/IRegistry.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

/**
 * @title Registry
 * @author Aztec Labs
 * @notice Keeps track of important information for L1<>L2 communication.
 */
contract Registry is IRegistry {
  uint256 public latestVersionNumber;
  mapping(uint256 version => DataStructures.RegistrySnapshot snapshot) snapshots;
  DataStructures.RegistrySnapshot latestSnapshot;

  // todo: this function has to be permissioned.
  function upgrade(address _rollup, address _inbox, address _outbox) public {
    latestVersionNumber++;
    DataStructures.RegistrySnapshot memory newSnapshot =
      DataStructures.RegistrySnapshot(_rollup, _inbox, _outbox, block.number);
    latestSnapshot = newSnapshot;
    snapshots[latestVersionNumber] = newSnapshot;
  }

  function getRollup() external view override returns (IRollup) {
    return IRollup(latestSnapshot.rollup);
  }

  function getInbox() external view override returns (IInbox) {
    return IInbox(latestSnapshot.inbox);
  }

  function getOutbox() external view override returns (IOutbox) {
    return IOutbox(latestSnapshot.outbox);
  }

  function getSnapshot(uint256 _version)
    external
    view
    override
    returns (DataStructures.RegistrySnapshot memory)
  {
    return snapshots[_version];
  }

  function getLatestSnapshot()
    external
    view
    override
    returns (DataStructures.RegistrySnapshot memory)
  {
    return latestSnapshot;
  }
}
