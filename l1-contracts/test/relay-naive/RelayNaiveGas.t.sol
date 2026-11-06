// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

import {TokenPortal} from "../portals/TokenPortal.sol";
import {Multicall3} from "../benchmark/Multicall3.sol";

import {RelayExecutor} from "@aztec/relay-naive/RelayExecutor.sol";
import {RelayVault} from "@aztec/relay-naive/RelayVault.sol";
import {
  ClaimItem,
  OutboxWitness,
  ReceiptWitness,
  RelayCall,
  RelayLib,
  RelayRequest
} from "@aztec/relay-naive/RelayTypes.sol";

import {MockSweep} from "./MockSweep.sol";
import {RelayNaiveBase} from "./RelayNaiveBase.sol";

/**
 * @notice Gas benches for the naive RelayVault and RelayExecutor. Run with `--isolate`:
 *   forge test --match-path 'test/relay-naive/*' --isolate -vv
 * Each top-level call is then its own transaction with cold storage and `GAS | ...` lines report the full
 * transaction gas (21,000 intrinsic + calldata, with the EIP-7623 floor applied, + execution).
 */
contract RelayNaiveGasTest is RelayNaiveBase {
  function _requestMessages(RelayRequest[] memory _reqs)
    internal
    view
    returns (DataStructures.L2ToL1Msg[] memory msgs)
  {
    msgs = new DataStructures.L2ToL1Msg[](_reqs.length);
    for (uint256 i = 0; i < _reqs.length; i++) {
      msgs[i] = _requestMessage(RelayLib.requestId(_reqs[i]));
    }
  }

  function _claimItems(
    RelayRequest[] memory _reqs,
    OutboxWitness[] memory _outbox,
    ReceiptWitness[] memory _receipts,
    uint256 _offset
  ) internal pure returns (ClaimItem[] memory items) {
    items = new ClaimItem[](_reqs.length);
    for (uint256 i = 0; i < _reqs.length; i++) {
      items[i] = ClaimItem(_reqs[i], _outbox[i + _offset], _receipts[i]);
    }
  }

  // ---------------------------------------------------------------- 1. deposit

  function test_gas_deposit() public {
    _warmInbox();
    uint256 before = aztec.balanceOf(address(vault));
    _measure("deposit", APP_FUNDER, address(vault), abi.encodeCall(RelayVault.deposit, (APP, 100e18)));
    assertEq(aztec.balanceOf(address(vault)), before + 100e18);
  }

  // ---------------------------------------------------------------- 2, 4. sweeps

  function test_gas_sweeps() public {
    MockSweep direct = new MockSweep();
    uint256 baseline = _measure("sweep_direct_flip", RELAYER, address(direct), abi.encodeCall(MockSweep.flip, ()));

    (, RelayCall[] memory one) = _sweeps(1);
    uint256 g1 = _measure(
      "executeBatch_1_sweep", RELAYER, address(executor), abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, one))
    );
    assertTrue(MockSweep(one[0].target).flag());

    (, RelayCall[] memory ten) = _sweeps(10);
    uint256 g10 = _measure(
      "executeBatch_10_sweeps", RELAYER, address(executor), abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, ten))
    );
    for (uint256 i = 0; i < 10; i++) {
      assertTrue(MockSweep(ten[i].target).flag());
    }

    emit log_named_uint("SUMMARY | executeBatch_1_sweep overhead vs direct flip", g1 - baseline);
    emit log_named_uint("SUMMARY | executeBatch sweep marginal per call (g10 - g1) / 9", (g10 - g1) / 9);
    emit log_named_uint("SUMMARY | executeBatch_10_sweeps per call", g10 / 10);
  }

  // ---------------------------------------------------------------- 3. exit

  function test_gas_exit() public {
    _fundPortal(2);
    DataStructures.L2ToL1Msg[] memory msgs = new DataStructures.L2ToL1Msg[](2);
    address selfRecipient = address(0xbeef01);
    address relayedRecipient = address(0xbeef02);
    msgs[0] = _exitMessage(selfRecipient);
    msgs[1] = _exitMessage(relayedRecipient);
    OutboxWitness[] memory w = _publish(msgs);

    uint256 baseline = _measure(
      "exit_direct_tokenPortal_withdraw",
      selfRecipient,
      address(portal),
      abi.encodeCall(TokenPortal.withdraw, (selfRecipient, EXIT_AMOUNT, false, w[0].epoch, 1, 0, w[0].path))
    );

    _nextBlock();
    RelayCall[] memory calls = new RelayCall[](1);
    calls[0] = _exitCall(Exit(relayedRecipient, w[1], _emptyRequest(), _emptyCall()));
    uint256 g = _measure(
      "executeBatch_1_exit", RELAYER, address(executor), abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, calls))
    );
    assertEq(token.balanceOf(relayedRecipient), EXIT_AMOUNT);
    emit log_named_uint("SUMMARY | executeBatch_1_exit overhead vs direct withdraw", g - baseline);
  }

  // ---------------------------------------------------------------- 5, 6. claims

  function test_gas_claims() public {
    // Batch of one sweep, claimed alone.
    (RelayRequest[] memory r1, RelayCall[] memory c1) = _sweeps(1);
    ReceiptWitness[] memory rw1 = _receiptWitnesses(c1, _execute(c1));
    // Batch of ten sweeps, claimed together.
    (RelayRequest[] memory r10, RelayCall[] memory c10) = _sweeps(10);
    ReceiptWitness[] memory rw10 = _receiptWitnesses(c10, _execute(c10));
    _nextBlock();

    OutboxWitness[] memory ow1 = _publish(_requestMessages(r1));
    OutboxWitness[] memory ow10 = _publish(_requestMessages(r10));

    uint256 relayerBefore = aztec.balanceOf(RELAYER);
    uint256 g1 = _measure(
      "claim_1", RELAYER, address(vault), abi.encodeCall(RelayVault.claim, (RELAYER, _claimItems(r1, ow1, rw1, 0)))
    );
    uint256 paid1 = aztec.balanceOf(RELAYER) - relayerBefore;
    assertEq(paid1, rw1[0].gasUsed * PRICE_PER_GAS + TIP, "claim_1 payment");

    uint256 g10 = _measure(
      "claim_10", RELAYER, address(vault), abi.encodeCall(RelayVault.claim, (RELAYER, _claimItems(r10, ow10, rw10, 0)))
    );
    emit log_named_uint("SUMMARY | claim marginal per request (g10 - g1) / 9", (g10 - g1) / 9);
    emit log_named_uint("SUMMARY | claim_10 per request", g10 / 10);
  }

  // ---------------------------------------------------------------- 7. execute + claim, one exit

  function test_gas_executeAndClaim_exit() public {
    _fundPortal(2);
    // Separate transactions first, for comparison.
    (uint256 execSeparate, uint256 claimSeparate) = _exitSeparate();

    _nextBlock();
    address recipient = address(0xbeef04);
    Exit memory e = _preparedExit(recipient);
    // The receipt needs the call's gasUsed, which the relayer gets by simulating the execution.
    uint256 snap = vm.snapshotState();
    RelayCall[] memory calls = new RelayCall[](1);
    calls[0] = e.call;
    ReceiptWitness[] memory rw = _receiptWitnesses(calls, _execute(calls));
    vm.revertToState(snap);

    RelayRequest[] memory reqs = new RelayRequest[](1);
    reqs[0] = e.request;
    OutboxWitness[] memory ow = new OutboxWitness[](1);
    ow[0] = _requestWitness;
    Multicall3.Call3[] memory mc = new Multicall3.Call3[](2);
    mc[0] = Multicall3.Call3({
      target: address(executor),
      allowFailure: false,
      callData: abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, calls))
    });
    mc[1] = Multicall3.Call3({
      target: address(vault),
      allowFailure: false,
      callData: abi.encodeCall(RelayVault.claim, (RELAYER, _claimItems(reqs, ow, rw, 0)))
    });
    uint256 g = _measure(
      "executeAndClaim_1_exit_multicall", RELAYER, address(multicall), abi.encodeCall(Multicall3.aggregate3, (mc))
    );
    assertEq(token.balanceOf(recipient), EXIT_AMOUNT);
    emit log_named_uint("SUMMARY | exit execute + claim as two separate txs", execSeparate + claimSeparate);
    emit log_named_uint("SUMMARY | exit execute + claim in one multicall tx", g);
  }

  OutboxWitness internal _requestWitness;

  /// @dev Publishes an exit message and its relay request in one epoch tree and returns the exit with its call.
  function _preparedExit(address _recipient) internal returns (Exit memory e) {
    // The exit's position is known before publishing (leaf 0), so the postcondition and request can be built first.
    DataStructures.L2ToL1Msg[] memory msgs = new DataStructures.L2ToL1Msg[](2);
    msgs[0] = _exitMessage(_recipient);
    // Placeholder for the request leaf, replaced once the request (which depends on the exit witness) is known.
    e.recipient = _recipient;
    e.witness = OutboxWitness(_peekEpoch(), 1, 0, new bytes32[](H));
    RelayCall memory call = _exitCall(e);
    e.request = _request(address(portal), call.post);
    call.requestId = RelayLib.requestId(e.request);
    msgs[1] = _requestMessage(call.requestId);
    OutboxWitness[] memory w = _publish(msgs);
    e.witness = w[0];
    _requestWitness = w[1];
    // Rebuild the calldata with the real exit path; the postcondition does not depend on the path, only its length.
    e.call = _exitCall(e);
    e.call.requestId = call.requestId;
    require(RelayLib.postconditionHash(e.call.post) == e.request.postconditionHash, "postcondition moved");
  }

  function _peekEpoch() internal view returns (Epoch) {
    return Epoch.wrap(nextEpoch);
  }

  function _exitSeparate() internal returns (uint256 execGas, uint256 claimGas) {
    Exit memory e = _preparedExit(address(0xbeef03));
    RelayCall[] memory calls = new RelayCall[](1);
    calls[0] = e.call;
    vm.recordLogs();
    execGas = _measure(
      "executeBatch_1_exit_with_request",
      RELAYER,
      address(executor),
      abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, calls))
    );
    ReceiptWitness[] memory rw = _receiptWitnesses(calls, _gasUsedFromLogs(vm.getRecordedLogs(), 1));
    RelayRequest[] memory reqs = new RelayRequest[](1);
    reqs[0] = e.request;
    OutboxWitness[] memory ow = new OutboxWitness[](1);
    ow[0] = _requestWitness;
    claimGas = _measure(
      "claim_1_exit", RELAYER, address(vault), abi.encodeCall(RelayVault.claim, (RELAYER, _claimItems(reqs, ow, rw, 0)))
    );
  }

  function _emptyRequest() internal pure returns (RelayRequest memory r) {}

  function _emptyCall() internal pure returns (RelayCall memory c) {}

  // ---------------------------------------------------------------- 8. refund

  function test_gas_refund() public {
    _warmInbox();
    (RelayRequest[] memory reqs,) = _sweeps(2);
    OutboxWitness[] memory w = _publish(_requestMessages(reqs));
    vm.warp(uint256(reqs[1].deadline) + CLAIM_WINDOW + 1);
    vm.roll(block.number + 1);

    uint256 before = vault.remainders(APP);
    _measure("refund_to_l1_remainder", APP_FUNDER, address(vault), abi.encodeCall(RelayVault.refund, (reqs[0], w[0])));
    assertEq(vault.remainders(APP), before + MAX_PAYMENT + TIP);

    _nextBlock();
    _measure("refund_to_l2_inbox", APP_FUNDER, address(vault), abi.encodeCall(RelayVault.refundToL2, (reqs[1], w[1])));
  }
}
