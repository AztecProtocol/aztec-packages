// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";
import {RollupBase, IInstance} from "../base/RollupBase.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {Multicall3} from "../benchmark/Multicall3.sol";

import {
  CheckpointLog,
  EthValue,
  IRollup,
  IRollupCore,
  ProvenCheckpointFees,
  PublicInputArgs,
  SubmitEpochRootProofArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Epoch, Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {RelayExecutor} from "@aztec/relay-v2/RelayExecutor.sol";
import {RelayVault} from "@aztec/relay-v2/RelayVault.sol";
import {OutboxWitness, ProofClaimItem, ProofRequest, RelayLib} from "@aztec/relay-v2/RelayTypes.sol";

/**
 * @notice Fast-proof benches for v2. Same setup as RelayNaiveProofGasTest: the two `mixed_checkpoint_*` fixtures are
 * proposed, and the measured proof is a partial epoch proof for checkpoints 1..2 (mock verifier). Fast-proof request
 * messages cannot be placed in the fixture's out hash, so they sit in Outbox roots inserted by impersonating the
 * Rollup, in a separate epoch, with the same steady-state assumptions as the relay benches. Run with `--isolate`.
 */
abstract contract RelayV2ProofBase is RollupBase {
  using Hash for DataStructures.L2ToL1Msg;

  string internal constant FIXTURE = "mixed_checkpoint_";
  address internal constant PROVER = address(0x9407e5);
  bytes32 internal constant ESCROW_L2 = bytes32(uint256(0x0e5c2011));
  bytes32 internal constant APP = bytes32(uint256(0xa99));
  uint256 internal constant PROOF_AMOUNT = 5e18;
  uint256 internal constant H = 6;

  RelayExecutor internal executor;
  RelayVault internal vault;
  TestERC20 internal aztec;
  Multicall3 internal multicall;
  uint256 internal version;

  uint256 internal nextEpoch = 1000;
  uint256 internal nextSalt = 1;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS,
      TestConstants.ETHEREUM_SLOT_DURATION
    );
  }

  /// @dev Whether setUp proves checkpoint 1 on its own first, so the measured proof of 1..2 is not the first proof.
  function _preProve() internal pure virtual returns (bool);

  function setUp() public {
    DecoderBase.Full memory full = load(string.concat(FIXTURE, "1"));
    uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
    vm.warp(Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * TestConstants.AZTEC_SLOT_DURATION);

    RollupBuilder builder =
      new RollupBuilder(address(this)).setTargetCommitteeSize(0).setProvingCostPerMana(EthValue.wrap(1000));
    builder.deploy();
    rollup = IInstance(address(builder.getConfig().rollup));
    inbox = Inbox(address(rollup.getInbox()));
    outbox = Outbox(address(rollup.getOutbox()));
    version = rollup.getVersion();
    executor = new RelayExecutor(IRollup(address(rollup)));
    aztec = new TestERC20("Aztec", "AZTEC", address(this));
    vault =
      new RelayVault(aztec, rollup.getInbox(), outbox, IRollup(address(rollup)), executor, ESCROW_L2, version, 7 days);
    multicall = new Multicall3();
    // Steady state: vault and prover AZTEC balances are non-zero before and after.
    aztec.mint(address(vault), 1_000_000e18);
    aztec.mint(PROVER, 1);
    // The app's remainder balance is already non-zero (refundProof writes it).
    vm.store(address(vault), keccak256(abi.encode(APP, uint256(0))), bytes32(uint256(1)));
    assertEq(vault.remainders(APP), 1, "remainder slot");

    _proposeCheckpoint(string.concat(FIXTURE, "1"), 1);
    _proposeCheckpoint(string.concat(FIXTURE, "2"), 2);
    if (_preProve()) {
      vm.prank(PROVER);
      rollup.submitEpochRootProof(_proofArgs(1));
      assertEq(rollup.getProvenCheckpointNumber(), 1);
    }
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

  function _submit(uint256 _n) internal {
    vm.prank(PROVER);
    rollup.submitEpochRootProof(_proofArgs(_n));
    assertEq(rollup.getProvenCheckpointNumber(), _n);
  }

  // ---------------------------------------------------------------- fast-proof requests

  /**
   * @dev `_n` fast-proof requests for checkpoint `_k`, published as leaves 0..n-1 of a fresh epoch tree of height H,
   * plus a filler leaf that is consumed right away so the epoch's nullifier bitmap word is non-zero (steady state).
   */
  function _proofRequests(uint256 _n, uint256 _k) internal returns (ProofClaimItem[] memory items) {
    items = new ProofClaimItem[](_n);
    NaiveMerkle tree = new NaiveMerkle(H);
    Epoch epoch = Epoch.wrap(nextEpoch++);
    for (uint256 i = 0; i < _n; i++) {
      items[i].request = ProofRequest({
        app: APP,
        checkpoint: _k,
        amount: PROOF_AMOUNT,
        expiration: uint64(block.timestamp + 1 hours),
        salt: bytes32(nextSalt++)
      });
      tree.insertLeaf(_requestMessage(RelayLib.proofRequestId(items[i].request)).sha256ToField());
    }
    DataStructures.L2ToL1Msg memory filler = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(bytes32(uint256(0xf111)), version),
      recipient: DataStructures.L1Actor(address(this), block.chainid),
      content: bytes32(uint256(0xf111 + Epoch.unwrap(epoch)))
    });
    tree.insertLeaf(filler.sha256ToField());
    bytes32 root = tree.computeRoot();
    vm.prank(address(rollup));
    outbox.insert(epoch, 1, root);
    for (uint256 i = 0; i < _n; i++) {
      (bytes32[] memory path,) = tree.computeSiblingPath(i);
      items[i].outbox = OutboxWitness(epoch, 1, i, path);
    }
    (bytes32[] memory fillerPath,) = tree.computeSiblingPath(_n);
    outbox.consume(filler, epoch, 1, _n, fillerPath);
  }

  function _requestMessage(bytes32 _requestId) internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(ESCROW_L2, version),
      recipient: DataStructures.L1Actor(address(vault), block.chainid),
      content: _requestId
    });
  }

  function _claimProof(string memory _label, ProofClaimItem[] memory _items) internal returns (uint256 gas) {
    uint256 before = aztec.balanceOf(PROVER);
    gas = _measure(_label, address(vault), abi.encodeCall(RelayVault.claimProof, (PROVER, _items)));
    assertEq(aztec.balanceOf(PROVER) - before, PROOF_AMOUNT * _items.length, "prover payment");
  }

  function _submitAndClaim(string memory _label, ProofClaimItem[] memory _items) internal returns (uint256 gas) {
    Multicall3.Call3[] memory mc = new Multicall3.Call3[](2);
    mc[0] = Multicall3.Call3({
      target: address(rollup),
      allowFailure: false,
      callData: abi.encodeCall(IRollupCore.submitEpochRootProof, (_proofArgs(2)))
    });
    mc[1] = Multicall3.Call3({
      target: address(vault), allowFailure: false, callData: abi.encodeCall(RelayVault.claimProof, (PROVER, _items))
    });
    uint256 before = aztec.balanceOf(PROVER);
    gas = _measure(_label, address(multicall), abi.encodeCall(Multicall3.aggregate3, (mc)));
    assertEq(rollup.getProvenCheckpointNumber(), 2);
    assertEq(aztec.balanceOf(PROVER) - before, PROOF_AMOUNT * _items.length, "prover payment");
  }
}

/// @notice Steady state as in the baseline: checkpoint 1 is already proven, and the measured proof covers 1..2.
contract RelayV2ProofGasTest is RelayV2ProofBase {
  function _preProve() internal pure override returns (bool) {
    return true;
  }

  function test_gas_submitEpochRootProof_direct() public {
    _measure(
      "submitEpochRootProof_direct", address(rollup), abi.encodeCall(IRollupCore.submitEpochRootProof, (_proofArgs(2)))
    );
    assertEq(rollup.getProvenCheckpointNumber(), 2);
  }

  /// @dev Checkpoint 2 is the last of the 1..2 proof, so getFirstProvenBy finds its entry on the first read.
  function test_gas_claimProof() public {
    ProofClaimItem[] memory one = _proofRequests(1, 2);
    ProofClaimItem[] memory ten = _proofRequests(10, 2);
    _submit(2);
    uint256 g1 = _claimProof("claimProof_1", one);
    uint256 g10 = _claimProof("claimProof_10", ten);
    emit log_named_uint("SUMMARY | claimProof marginal per request (g10 - g1) / 9", (g10 - g1) / 9);
    emit log_named_uint("SUMMARY | claimProof_10 per request", g10 / 10);
  }

  function test_gas_submitAndClaimProof_1_multicall() public {
    _submitAndClaim("submitAndClaimProof_1_multicall", _proofRequests(1, 2));
  }

  function test_gas_submitAndClaimProof_10_multicall() public {
    _submitAndClaim("submitAndClaimProof_10_multicall", _proofRequests(10, 2));
  }

  function test_gas_submitEpochRootProof_viaMulticall_noClaim() public {
    Multicall3.Call3[] memory mc = new Multicall3.Call3[](1);
    mc[0] = Multicall3.Call3({
      target: address(rollup),
      allowFailure: false,
      callData: abi.encodeCall(IRollupCore.submitEpochRootProof, (_proofArgs(2)))
    });
    _measure(
      "submitEpochRootProof_viaMulticall_noClaim", address(multicall), abi.encodeCall(Multicall3.aggregate3, (mc))
    );
    assertEq(rollup.getProvenCheckpointNumber(), 2);
  }

  function test_gas_refundProof() public {
    ProofClaimItem[] memory one = _proofRequests(1, 2);
    vm.warp(uint256(one[0].request.expiration) + 1);
    vm.roll(block.number + 1);
    _measure("refundProof", address(vault), abi.encodeCall(RelayVault.refundProof, (one[0].request, one[0].outbox)));
  }
}

/**
 * @notice The measured proof of 1..2 is the first proof, so checkpoint 1 has no firstProvenBy entry and
 * getFirstProvenBy(1) walks forward to the entry at 2.
 */
contract RelayV2ProofNotLastGasTest is RelayV2ProofBase {
  function _preProve() internal pure override returns (bool) {
    return false;
  }

  function test_gas_getFirstProvenBy() public {
    _submit(2);
    uint256 last = _measure("getFirstProvenBy_last", address(rollup), abi.encodeCall(IRollup.getFirstProvenBy, (2)));
    uint256 notLast =
      _measure("getFirstProvenBy_notLast", address(rollup), abi.encodeCall(IRollup.getFirstProvenBy, (1)));
    emit log_named_uint("SUMMARY | getFirstProvenBy extra per checkpoint walked (notLast - last)", notLast - last);
  }

  function test_gas_claimProof_notLast() public {
    ProofClaimItem[] memory atLast = _proofRequests(1, 2);
    ProofClaimItem[] memory atFirst = _proofRequests(1, 1);
    ProofClaimItem[] memory tenAtFirst = _proofRequests(10, 1);
    _submit(2);
    uint256 gLast = _claimProof("claimProof_1_lastCheckpoint", atLast);
    uint256 gFirst = _claimProof("claimProof_1_notLastCheckpoint", atFirst);
    uint256 g10First = _claimProof("claimProof_10_notLastCheckpoint", tenAtFirst);
    emit log_named_uint("SUMMARY | claimProof_1 notLast - last", gFirst - gLast);
    emit log_named_uint("SUMMARY | claimProof notLast marginal per request (g10 - g1) / 9", (g10First - gFirst) / 9);
  }
}
