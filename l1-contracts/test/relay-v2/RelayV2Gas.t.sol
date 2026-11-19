// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

import {TokenPortal} from "../portals/TokenPortal.sol";
import {Multicall3} from "../benchmark/Multicall3.sol";

import {RelayExecutor} from "@aztec/relay-v2/RelayExecutor.sol";
import {RelayVault} from "@aztec/relay-v2/RelayVault.sol";
import {
  ClaimItem,
  OutboxWitness,
  PRECONDITION_ERC20_BALANCE,
  PRECONDITION_NONE,
  PRECONDITION_OUTBOX_MESSAGE,
  ReceiptWitness,
  RelayCall,
  RelayLib,
  RelayRequest
} from "@aztec/relay-v2/RelayTypes.sol";

import {MockSweep} from "./MockSweep.sol";
import {RelayV2Base} from "./RelayV2Base.sol";

/**
 * @notice Gas benches for the v2 RelayVault and RelayExecutor, mirroring RelayNaiveGasTest. Run with `--isolate`:
 *   FORGE_SNAPSHOT_EMIT=false forge test --match-path 'test/relay-v2/*' --isolate -vv
 * Each top-level call is then its own transaction with cold storage and `GAS | ...` lines report the full
 * transaction gas (21,000 intrinsic + calldata, with the EIP-7623 floor applied, + execution).
 */
contract RelayV2GasTest is RelayV2Base {
  function _claimItems(RelayRequest[] memory _reqs, OutboxWitness[] memory _outbox, ReceiptWitness[] memory _receipts)
    internal
    pure
    returns (ClaimItem[] memory items)
  {
    items = new ClaimItem[](_reqs.length);
    for (uint256 i = 0; i < _reqs.length; i++) {
      items[i] = ClaimItem(_reqs[i], _outbox[i], _receipts[i]);
    }
  }

  function _batch(string memory _label, RelayExecutor _executor, RelayCall[] memory _calls) internal returns (uint256) {
    return _measure(_label, RELAYER, address(_executor), abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, _calls)));
  }

  function _assertSwept(RelayCall[] memory _calls) internal view {
    for (uint256 i = 0; i < _calls.length; i++) {
      assertTrue(MockSweep(_calls[i].target).flag());
    }
  }

  // ---------------------------------------------------------------- 1. deposit

  function test_gas_deposit() public {
    _warmInbox();
    uint256 before = aztec.balanceOf(address(vault));
    _measure("deposit", APP_FUNDER, address(vault), abi.encodeCall(RelayVault.deposit, (APP, 100e18)));
    assertEq(aztec.balanceOf(address(vault)), before + 100e18);
  }

  // ---------------------------------------------------------------- 2, 4. sweeps, ERC20_BALANCE and NONE

  /// @dev Builds `_n` fresh sweeps with precondition `_kind`, executes them through `_executor` and measures it.
  function _sweepBatch(string memory _label, RelayExecutor _executor, uint256 _n, uint8 _kind)
    internal
    returns (uint256 gas)
  {
    (, RelayCall[] memory calls) = _sweeps(_n, _kind);
    gas = _batch(_label, _executor, calls);
    _assertSwept(calls);
  }

  function test_gas_sweeps() public {
    MockSweep direct = new MockSweep();
    uint256 baseline = _measure("sweep_direct_flip", RELAYER, address(direct), abi.encodeCall(MockSweep.flip, ()));

    uint256 g1 = _sweepBatch("executeBatch_1_sweep_erc20", executor, 1, PRECONDITION_ERC20_BALANCE);
    uint256 g10 = _sweepBatch("executeBatch_10_sweeps_erc20", executor, 10, PRECONDITION_ERC20_BALANCE);
    uint256 n1 = _sweepBatch("executeBatch_1_sweep_none", executor, 1, PRECONDITION_NONE);
    uint256 n10 = _sweepBatch("executeBatch_10_sweeps_none", executor, 10, PRECONDITION_NONE);

    emit log_named_uint("SUMMARY | executeBatch_1_sweep_erc20 overhead vs direct flip", g1 - baseline);
    emit log_named_uint("SUMMARY | executeBatch sweep_erc20 marginal per call (g10 - g1) / 9", (g10 - g1) / 9);
    emit log_named_uint("SUMMARY | executeBatch_10_sweeps_erc20 per call", g10 / 10);
    emit log_named_uint("SUMMARY | executeBatch_1_sweep_none overhead vs direct flip", n1 - baseline);
    emit log_named_uint("SUMMARY | executeBatch sweep_none marginal per call (n10 - n1) / 9", (n10 - n1) / 9);
    emit log_named_uint("SUMMARY | ERC20_BALANCE cost, 1 sweep (g1 - n1)", g1 - n1);
    emit log_named_uint("SUMMARY | ERC20_BALANCE cost, 10 sweeps (g10 - n10)", g10 - n10);
  }

  // ---------------------------------------------------------------- oracle read, per batch

  function test_gas_oracle() public {
    uint256 o1 = _sweepBatch("executeBatch_1_sweep_erc20_oracle", executor, 1, PRECONDITION_ERC20_BALANCE);
    uint256 f1 = _sweepBatch("executeBatch_1_sweep_erc20_fixedPrice", fixedPriceExecutor, 1, PRECONDITION_ERC20_BALANCE);
    uint256 o10 = _sweepBatch("executeBatch_10_sweeps_erc20_oracle", executor, 10, PRECONDITION_ERC20_BALANCE);
    uint256 f10 =
      _sweepBatch("executeBatch_10_sweeps_erc20_fixedPrice", fixedPriceExecutor, 10, PRECONDITION_ERC20_BALANCE);

    emit log_named_uint("SUMMARY | oracle read per batch, 1 call (o1 - f1)", o1 - f1);
    emit log_named_uint("SUMMARY | oracle read per batch, 10 calls (o10 - f10)", o10 - f10);
  }

  // ---------------------------------------------------------------- 3. exit, OUTBOX_MESSAGE and NONE

  function _relayExit(string memory _label, uint8 _kind, address _recipient, OutboxWitness memory _w)
    internal
    returns (uint256 gas)
  {
    RelayCall[] memory calls = new RelayCall[](1);
    calls[0] = _exitCall(_kind, _recipient, _exitRequest(_kind, _recipient), _w);
    gas = _batch(_label, executor, calls);
    assertEq(token.balanceOf(_recipient), EXIT_AMOUNT);
  }

  function test_gas_exit() public {
    _fundPortal(3);
    DataStructures.L2ToL1Msg[] memory msgs = new DataStructures.L2ToL1Msg[](3);
    msgs[0] = _exitMessage(address(0xbeef01));
    msgs[1] = _exitMessage(address(0xbeef02));
    msgs[2] = _exitMessage(address(0xbeef05));
    OutboxWitness[] memory w = _publish(msgs);

    uint256 baseline = _measure(
      "exit_direct_tokenPortal_withdraw",
      address(0xbeef01),
      address(portal),
      abi.encodeCall(TokenPortal.withdraw, (address(0xbeef01), EXIT_AMOUNT, false, w[0].epoch, 1, 0, w[0].path))
    );

    _nextBlock();
    uint256 g = _relayExit("executeBatch_1_exit_outboxMessage", PRECONDITION_OUTBOX_MESSAGE, address(0xbeef02), w[1]);
    _nextBlock();
    uint256 gNone = _relayExit("executeBatch_1_exit_none", PRECONDITION_NONE, address(0xbeef05), w[2]);

    emit log_named_uint("SUMMARY | executeBatch_1_exit_outboxMessage overhead vs direct withdraw", g - baseline);
    emit log_named_uint("SUMMARY | executeBatch_1_exit_none overhead vs direct withdraw", gNone - baseline);
    emit log_named_uint("SUMMARY | OUTBOX_MESSAGE cost, 1 exit (g - gNone)", g - gNone);
  }

  // ---------------------------------------------------------------- 5, 6. claims

  struct ClaimSet {
    RelayRequest[] reqs;
    RelayCall[] calls;
    ReceiptWitness[] receipts;
    OutboxWitness[] outbox;
  }

  function _executedSweeps(uint256 _n) internal returns (ClaimSet memory set) {
    (set.reqs, set.calls) = _sweeps(_n, PRECONDITION_ERC20_BALANCE);
    set.receipts = _receiptWitnesses(set.calls, _execute(set.calls));
  }

  function _measureClaim(string memory _label, ClaimSet memory _set) internal returns (uint256 gas) {
    uint256 relayerBefore = aztec.balanceOf(RELAYER);
    uint256 remainderBefore = vault.remainders(APP);
    gas = _measure(
      _label,
      RELAYER,
      address(vault),
      abi.encodeCall(RelayVault.claim, (RELAYER, _claimItems(_set.reqs, _set.outbox, _set.receipts)))
    );
    uint256 expected = 0;
    for (uint256 i = 0; i < _set.reqs.length; i++) {
      uint256 payment = _expectedPayment(_set.receipts[i].gasUsed);
      assertGt(payment - TIP, 0, "oracle cost");
      assertLt(payment - TIP, _set.receipts[i].gasUsed * MAX_AZTEC_PER_GAS, "cap does not bind");
      expected += payment;
    }
    assertEq(aztec.balanceOf(RELAYER) - relayerBefore, expected, "payment");
    assertEq(
      vault.remainders(APP) - remainderBefore,
      _set.reqs.length * (CALL_GAS * MAX_AZTEC_PER_GAS + TIP) - expected,
      "change to the app"
    );
  }

  function test_gas_claims() public {
    // Batch of one sweep, claimed alone, and batch of ten sweeps, claimed together.
    ClaimSet memory s1 = _executedSweeps(1);
    ClaimSet memory s10 = _executedSweeps(10);
    _nextBlock();
    s1.outbox = _publish(_requestMessages(s1.reqs));
    s10.outbox = _publish(_requestMessages(s10.reqs));

    uint256 g1 = _measureClaim("claim_1", s1);
    uint256 g10 = _measureClaim("claim_10", s10);
    emit log_named_uint("SUMMARY | claim marginal per request (g10 - g1) / 9", (g10 - g1) / 9);
    emit log_named_uint("SUMMARY | claim_10 per request", g10 / 10);
  }

  // ---------------------------------------------------------------- 7. execute + claim, one exit

  function test_gas_executeAndClaim_exit_outboxMessage() public {
    _executeAndClaim(PRECONDITION_OUTBOX_MESSAGE, "outboxMessage");
  }

  function test_gas_executeAndClaim_exit_none() public {
    _executeAndClaim(PRECONDITION_NONE, "none");
  }

  struct PreparedExit {
    address recipient;
    RelayRequest request;
    RelayCall call;
    OutboxWitness requestWitness;
  }

  function _executeAndClaim(uint8 _kind, string memory _tag) internal {
    _fundPortal(2);
    (uint256 execSeparate, uint256 claimSeparate) = _exitSeparate(_kind, _tag);

    _nextBlock();
    PreparedExit memory e = _preparedExit(_kind, address(0xbeef04));
    RelayCall[] memory calls = new RelayCall[](1);
    calls[0] = e.call;
    // The receipt needs the call's gasUsed, which the relayer gets by simulating the execution.
    uint256 snap = vm.snapshotState();
    ReceiptWitness[] memory rw = _receiptWitnesses(calls, _execute(calls));
    vm.revertToState(snap);

    Multicall3.Call3[] memory mc = new Multicall3.Call3[](2);
    mc[0] = Multicall3.Call3({
      target: address(executor),
      allowFailure: false,
      callData: abi.encodeCall(RelayExecutor.executeBatch, (RELAYER, calls))
    });
    mc[1] = Multicall3.Call3({
      target: address(vault), allowFailure: false, callData: abi.encodeCall(RelayVault.claim, (RELAYER, _items(e, rw)))
    });
    uint256 g = _measure(
      string.concat("executeAndClaim_1_exit_", _tag, "_multicall"),
      RELAYER,
      address(multicall),
      abi.encodeCall(Multicall3.aggregate3, (mc))
    );
    assertEq(token.balanceOf(e.recipient), EXIT_AMOUNT);
    emit log_named_uint(
      string.concat("SUMMARY | exit_", _tag, " execute + claim as two separate txs"), execSeparate + claimSeparate
    );
    emit log_named_uint(string.concat("SUMMARY | exit_", _tag, " execute + claim in one multicall tx"), g);
  }

  function _items(PreparedExit memory _e, ReceiptWitness[] memory _rw) internal pure returns (ClaimItem[] memory) {
    RelayRequest[] memory reqs = new RelayRequest[](1);
    reqs[0] = _e.request;
    OutboxWitness[] memory ow = new OutboxWitness[](1);
    ow[0] = _e.requestWitness;
    return _claimItems(reqs, ow, _rw);
  }

  /// @dev Publishes an exit message and its relay request in one epoch tree.
  function _preparedExit(uint8 _kind, address _recipient) internal returns (PreparedExit memory e) {
    e.recipient = _recipient;
    e.request = _exitRequest(_kind, _recipient);
    DataStructures.L2ToL1Msg[] memory msgs = new DataStructures.L2ToL1Msg[](2);
    msgs[0] = _exitMessage(_recipient);
    msgs[1] = _requestMessage(RelayLib.requestId(e.request));
    OutboxWitness[] memory w = _publish(msgs);
    e.requestWitness = w[1];
    e.call = _exitCall(_kind, _recipient, e.request, w[0]);
  }

  function _exitSeparate(uint8 _kind, string memory _tag) internal returns (uint256 execGas, uint256 claimGas) {
    PreparedExit memory e = _preparedExit(_kind, address(0xbeef03));
    RelayCall[] memory calls = new RelayCall[](1);
    calls[0] = e.call;
    vm.recordLogs();
    execGas = _batch(string.concat("executeBatch_1_exit_", _tag, "_with_request"), executor, calls);
    ReceiptWitness[] memory rw = _receiptWitnesses(calls, _gasUsedFromLogs(vm.getRecordedLogs(), 1));
    claimGas = _measure(
      string.concat("claim_1_exit_", _tag),
      RELAYER,
      address(vault),
      abi.encodeCall(RelayVault.claim, (RELAYER, _items(e, rw)))
    );
  }

  // ---------------------------------------------------------------- 8. refund

  function test_gas_refund() public {
    _warmInbox();
    (RelayRequest[] memory reqs,) = _sweeps(2, PRECONDITION_ERC20_BALANCE);
    OutboxWitness[] memory w = _publish(_requestMessages(reqs));
    vm.warp(uint256(reqs[1].deadline) + CLAIM_WINDOW + 1);
    vm.roll(block.number + 1);

    uint256 before = vault.remainders(APP);
    _measure("refund_to_l1_remainder", APP_FUNDER, address(vault), abi.encodeCall(RelayVault.refund, (reqs[0], w[0])));
    assertEq(vault.remainders(APP), before + CALL_GAS * MAX_AZTEC_PER_GAS + TIP);

    _nextBlock();
    _measure("refund_to_l2_inbox", APP_FUNDER, address(vault), abi.encodeCall(RelayVault.refundToL2, (reqs[1], w[1])));
  }
}
