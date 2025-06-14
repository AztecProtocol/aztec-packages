// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {TimeStorage, Timestamp, TimeLib, Epoch, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {Vm} from "forge-std/Vm.sol";

interface ITimeCheater {
  function cheat__setTimeStorage(TimeStorage memory _timeStorage) external;
  function cheat__setEpochNow(uint256 _epoch) external;
  function cheat__progressEpoch() external;
  function cheat__jumpForwardEpochs(uint256 _epochs) external;
  function cheat__jumpForwardSlots(uint256 _slots) external;
  function cheat__progressSlot() external;
  function cheat__jumpToSlot(uint256 _slot) external;
  function getCurrentEpoch() external view returns (Epoch);
  function epochToTimestamp(Epoch _epoch) external view returns (Timestamp);
  function slotToTimestamp(Slot _slot) external view returns (Timestamp);
}

contract TimeCheater is ITimeCheater {
  Vm public constant vm = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));
  bytes32 public constant TIME_STORAGE_POSITION = keccak256("aztec.time.storage");

  address public immutable TARGET;
  uint64 public genesisTime;
  uint8 public slotDuration;
  uint8 public epochDuration;

  uint32 public currentSlot;

  constructor(
    address _target,
    uint256 _genesisTime,
    uint256 _slotDuration,
    uint256 _epochDuration
  ) {
    TARGET = _target;

    genesisTime = uint64(_genesisTime);
    slotDuration = uint8(_slotDuration);
    epochDuration = uint8(_epochDuration);
    cheat__setTimeStorage(
      TimeStorage({
        genesisTime: genesisTime,
        slotDuration: slotDuration,
        epochDuration: epochDuration
      })
    );
  }

  function cheat__setTimeStorage(TimeStorage memory _timeStorage) public override {
    vm.store(
      TARGET,
      TIME_STORAGE_POSITION,
      bytes32(
        abi.encodePacked(
          // Encoding order is a fun thing.
          bytes24(0),
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

  function cheat__setEpochNow(uint256 _epoch) public override {
    currentSlot = uint32(_epoch * epochDuration);
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__progressEpoch() public override {
    currentSlot += uint32(epochDuration);
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__jumpForwardEpochs(uint256 _epochs) public override {
    currentSlot += uint32(_epochs * epochDuration);
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__jumpForwardSlots(uint256 _slots) public override {
    currentSlot += uint32(_slots);
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__progressSlot() public override {
    currentSlot++;
    cheat__jumpToSlot(currentSlot);
  }

  function cheat__jumpToSlot(uint256 _slot) public override {
    currentSlot = uint32(_slot);
    vm.warp(genesisTime + currentSlot * slotDuration);
  }

  function getCurrentEpoch() public view override returns (Epoch) {
    return Epoch.wrap(uint32(currentSlot / epochDuration));
  }

  function epochToTimestamp(Epoch _epoch) public view override returns (Timestamp) {
    return TimeLib.toTimestamp(_epoch);
  }

  function slotToTimestamp(Slot _slot) public view override returns (Timestamp) {
    return TimeLib.toTimestamp(_slot);
  }
}
