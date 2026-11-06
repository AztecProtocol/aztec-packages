// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";
import {RollupBase, IInstance} from "../base/RollupBase.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

import {
  CheckpointLog,
  EthValue,
  IRollup,
  IRollupCore,
  ProvenCheckpointFees,
  PublicInputArgs,
  SubmitEpochRootProofArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

import {RelayExecutor} from "@aztec/relay-naive/RelayExecutor.sol";

/**
 * @notice Overhead of submitting an epoch root proof through RelayExecutor.submitProof instead of calling the Rollup
 * directly. Each test proposes the same two fixture checkpoints and proves the first one through the executor (so the
 * proven tip and the receipt array are non-zero, as in steady state). It then submits a partial epoch proof for
 * checkpoints 1..2 (mock verifier), directly or through the executor, so the two measured transactions differ only in
 * the wrapper. Run with `--isolate`.
 */
contract RelayNaiveProofGasTest is RollupBase {
  string internal constant FIXTURE = "mixed_checkpoint_";
  address internal constant PROVER = address(0x9407e5);

  RelayExecutor internal executor;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS,
      TestConstants.ETHEREUM_SLOT_DURATION
    );
  }

  function setUp() public {
    DecoderBase.Full memory full = load(string.concat(FIXTURE, "1"));
    uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
    vm.warp(Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * TestConstants.AZTEC_SLOT_DURATION);

    RollupBuilder builder =
      new RollupBuilder(address(this)).setTargetCommitteeSize(0).setProvingCostPerMana(EthValue.wrap(1000));
    builder.deploy();
    rollup = IInstance(address(builder.getConfig().rollup));
    inbox = Inbox(address(rollup.getInbox()));
    executor = new RelayExecutor(IRollup(address(rollup)));

    _proposeCheckpoint(string.concat(FIXTURE, "1"), 1);
    _proposeCheckpoint(string.concat(FIXTURE, "2"), 2);
    executor.submitProof(_proofArgs(1));
    assertEq(rollup.getProvenCheckpointNumber(), 1);
  }

  /// @dev Proofs always start at the epoch's first checkpoint, so a later partial proof re-proves from checkpoint 1.
  function _proofArgs(uint256 _n) internal view returns (SubmitEpochRootProofArgs memory) {
    DecoderBase.Full memory endFull = load(string.concat(FIXTURE, vm.toString(_n)));
    CheckpointLog memory parent = rollup.getCheckpoint(0);
    ProposedHeader[] memory headers = new ProposedHeader[](_n);
    for (uint256 i = 0; i < _n; i++) {
      headers[i] = proposedHeaders[i + 1];
    }
    return SubmitEpochRootProofArgs({
      start: 1,
      end: _n,
      args: PublicInputArgs({
        previousArchive: parent.archive,
        endArchive: endFull.checkpoint.archive,
        outHash: endFull.checkpoint.header.outHash,
        previousInboxRollingHash: proposedHeaders[0].inboxRollingHash,
        endInboxRollingHash: proposedHeaders[_n].inboxRollingHash,
        proverId: PROVER
      }),
      provenCheckpointFees: new ProvenCheckpointFees[](0),
      headers: headers,
      attestations: CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
      blobInputs: endFull.checkpoint.batchedBlobInputs,
      proof: ""
    });
  }

  function _measure(string memory _label, address _target, bytes memory _cd) internal returns (uint256 total) {
    vm.prank(PROVER);
    (bool ok, bytes memory ret) = _target.call(_cd);
    if (!ok) {
      assembly {
        revert(add(ret, 0x20), mload(ret))
      }
    }
    total = vm.snapshotGasLastCall(_label);
    emit log_string(string.concat(
        "GAS | ", _label, " | total=", vm.toString(total), " | calldataBytes=", vm.toString(_cd.length)
      ));
  }

  function test_gas_submitEpochRootProof_direct() public {
    _measure(
      "submitEpochRootProof_direct", address(rollup), abi.encodeCall(IRollupCore.submitEpochRootProof, (_proofArgs(2)))
    );
    assertEq(rollup.getProvenCheckpointNumber(), 2);
  }

  function test_gas_submitEpochRootProof_viaExecutor() public {
    _measure("submitProof_viaExecutor", address(executor), abi.encodeCall(RelayExecutor.submitProof, (_proofArgs(2))));
    assertEq(rollup.getProvenCheckpointNumber(), 2);
    (uint256 before, uint256 afterProof, address prover, uint256 time) = executor.proofReceipts(1);
    assertEq(before, 1);
    assertEq(afterProof, 2);
    assertEq(prover, PROVER);
    assertEq(time, block.timestamp);
  }
}
