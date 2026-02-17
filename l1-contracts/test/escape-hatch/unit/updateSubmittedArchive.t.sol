// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IEscapeHatchCore, CandidateInfo} from "@aztec/core/interfaces/IEscapeHatch.sol";

contract EscapeHatchUpdateSubmittedArchiveTest is EscapeHatchBase {
  function test_WhenCallerIsNotTheRollupContract(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should revert {EscapeHatch__OnlyRollup}
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__OnlyRollup.selector, address(this), _getRollup()));
    escapeHatch.updateSubmittedArchive(CANDIDATE1, 1, bytes32(uint256(1)));
  }

  function test_WhenCallerIsTheRollupContract(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should update proposer lastCheckpointNumber
    // it should update proposer lastSubmittedArchive
    // it should emit ArchiveUpdated event

    uint128 checkpointNumber = 42;
    bytes32 archive = bytes32(uint256(0xdeadbeef));

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ArchiveUpdated(CANDIDATE1, checkpointNumber, archive);

    vm.prank(_getRollup());
    escapeHatch.updateSubmittedArchive(CANDIDATE1, checkpointNumber, archive);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(info.lastCheckpointNumber, checkpointNumber, "lastCheckpointNumber mismatch");
    assertEq(info.lastSubmittedArchive, archive, "lastSubmittedArchive mismatch");
  }
}
