// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {TimeStorage, Timestamp, TimeLib, Epoch, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {Vm} from "forge-std/Vm.sol";

contract TimeCheater {
  Vm public constant vm = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));
  bytes32 public constant TIME_STORAGE_POSITION = keccak256("aztec.time.storage");

  address public immutable target;
  uint256 public genesisTime;
  uint256 public slotDuration;
  uint256 public epochDuration;

  uint256 public currentSlot;

  constructor(
    address _target,
    uint256 _genesisTime,
    uint256 _slotDuration,
    uint256 _epochDuration
  ) {
    target = _target;

    genesisTime = _genesisTime;
    slotDuration = _slotDuration;
    epochDuration = _epochDuration;
    cheat__setTimeStorage(
      TimeStorage({
        genesisTime: uint128(_genesisTime),
        slotDuration: uint32(_slotDuration),
        epochDuration: uint32(_epochDuration)
      })
    );
  }

  function getCurrentEpoch() public view returns (Epoch) {
    return Epoch.wrap(currentSlot / epochDuration);
  }

  function cheat__setTimeStorage(TimeStorage memory _timeStorage) public {
    vm.store(
      target,
      TIME_STORAGE_POSITION,
      bytes32(
        abi.encodePacked(
          // Encoding order is a fun thing.
          bytes8(0),
          _timeStorage.epochDuration,
          _timeStorage.slotDuration,
          _timeStorage.genesisTime
        )
      )
    );

    TimeLib.initialize(
      _timeStorage.genesisTime, _timeStorage.slotDuration, _timeStorage.epochDuration
    );
  }

  function epochToTimestamp(Epoch _epoch) public view returns (Timestamp) {
    return TimeLib.toTimestamp(_epoch);
  }

  function slotToTimestamp(Slot _slot) public view returns (Timestamp) {
    return TimeLib.toTimestamp(_slot);
  }

  function cheat__setEpochNow(uint256 _epoch) public {
    currentSlot = _epoch * epochDuration;
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__progressEpoch() public {
    currentSlot += epochDuration;
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__jumpForwardEpochs(uint256 _epochs) public {
    currentSlot += (_epochs * epochDuration);
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__jumpForwardSlots(uint256 _slots) public {
    currentSlot += _slots;
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__progressSlot() public {
    currentSlot++;
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__jumpToSlot(uint256 _slot) public {
    currentSlot = _slot;
    vm.warp(genesisTime + currentSlot * slotDuration);
  }
}
