// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Slot} from "@aztec/shared/libraries/TimeMath.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

interface IEmperor {
  // Not view because it might rely on transient storage.
  // Calls are essentially trusted
  function getCurrentProposer() external returns (address);

  function getCurrentSlot() external view returns (Slot);
}

interface IEmpire {
  event SignalCast(IPayload indexed payload, uint256 indexed round, address indexed signaler);
  event PayloadSubmittable(IPayload indexed payload, uint256 indexed round);
  event PayloadSubmitted(IPayload indexed payload, uint256 indexed round);

  function signal(IPayload _payload) external returns (bool);
  function signalWithSig(IPayload _payload, Signature memory _sig) external returns (bool);

  function submitRoundWinner(uint256 _roundNumber) external returns (bool);
  function signalCount(address _instance, uint256 _round, IPayload _payload) external view returns (uint256);
  function computeRound(Slot _slot) external view returns (uint256);
  function getInstance() external view returns (address);
}
