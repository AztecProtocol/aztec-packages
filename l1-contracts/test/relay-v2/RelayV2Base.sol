// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {EthPerFeeAssetE12} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {TokenPortal} from "../portals/TokenPortal.sol";
import {Multicall3} from "../benchmark/Multicall3.sol";

import {RelayExecutor} from "@aztec/relay-v2/RelayExecutor.sol";
import {RelayVault} from "@aztec/relay-v2/RelayVault.sol";
import {
  OutboxWitness,
  PRECONDITION_ERC20_BALANCE,
  PRECONDITION_NONE,
  PRECONDITION_OUTBOX_MESSAGE,
  Precondition,
  ReceiptWitness,
  RelayCall,
  RelayLib,
  RelayRequest
} from "@aztec/relay-v2/RelayTypes.sol";

import {MockSweep} from "./MockSweep.sol";
import {RelayExecutorFixedPrice} from "./RelayExecutorFixedPrice.sol";

/**
 * @notice v2 harness, adapted from RelayNaiveBase. Real Rollup, Inbox and Outbox from RollupBuilder, the real test
 * TokenPortal as the exit target, and the v2 RelayVault and RelayExecutor. Outbox roots are inserted by impersonating
 * the Rollup. Gas is the full transaction gas from `vm.snapshotGasLastCall` under `--isolate`, as in the baseline.
 */
contract RelayV2Base is Test {
  using Hash for DataStructures.L2ToL1Msg;

  uint256 internal constant H = 6;
  uint256 internal constant EXIT_AMOUNT = 1000e18;
  uint256 internal constant SWEEP_AMOUNT = 100e18;
  uint256 internal constant CLAIM_WINDOW = 7 days;
  uint256 internal constant CALL_GAS = 200_000;
  uint256 internal constant BASE_FEE = 0.1 gwei;
  /// @dev Above the oracle cost at BASE_FEE (1e13 at the builder's initial price), so the cap does not bind.
  uint256 internal constant MAX_AZTEC_PER_GAS = 2e13;
  uint256 internal constant TIP = 1e18;

  bytes32 internal constant L2_BRIDGE = bytes32(uint256(0x42));
  bytes32 internal constant ESCROW_L2 = bytes32(uint256(0x0e5c2011));
  bytes32 internal constant APP = bytes32(uint256(0xa99));
  address internal constant RELAYER = address(0x5e1a7e5);
  address internal constant APP_FUNDER = address(0xf00d);

  Rollup internal rollup;
  Registry internal registry;
  Inbox internal inbox;
  IOutbox internal outbox;
  TestERC20 internal token;
  TestERC20 internal aztec;
  TestERC20 internal sweepToken;
  TokenPortal internal portal;
  RelayExecutor internal executor;
  RelayExecutorFixedPrice internal fixedPriceExecutor;
  RelayVault internal vault;
  Multicall3 internal multicall;
  uint256 internal version;
  uint256 internal ethPerFeeAsset;

  uint256 internal nextEpoch = 1;
  uint256 internal nextSalt = 1;

  function setUp() public virtual {
    vm.fee(BASE_FEE);
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();
    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;
    inbox = Inbox(address(rollup.getInbox()));
    outbox = rollup.getOutbox();
    version = rollup.getVersion();
    ethPerFeeAsset = EthPerFeeAssetE12.unwrap(rollup.getEthPerFeeAsset());
    require(ethPerFeeAsset != 0, "no oracle price");

    portal = new TokenPortal();
    portal.initialize(address(registry), address(token), L2_BRIDGE);

    aztec = new TestERC20("Aztec", "AZTEC", address(this));
    sweepToken = new TestERC20("Swept", "SWEPT", address(this));
    executor = new RelayExecutor(rollup);
    fixedPriceExecutor = new RelayExecutorFixedPrice(rollup, ethPerFeeAsset);
    vault = new RelayVault(aztec, rollup.getInbox(), outbox, rollup, executor, ESCROW_L2, version, CLAIM_WINDOW);
    multicall = new Multicall3();

    // Steady state: every ERC20 balance and allowance the measured paths touch is already non-zero.
    aztec.mint(address(vault), 1_000_000e18);
    aztec.mint(RELAYER, 1);
    aztec.mint(APP_FUNDER, 1_000_000e18);
    vm.prank(APP_FUNDER);
    aztec.approve(address(vault), 1_000_000e18);
    // The app's remainder balance is already non-zero.
    _setRemainder(APP, 1);
  }

  function _setRemainder(bytes32 _app, uint256 _value) internal {
    vm.store(address(vault), keccak256(abi.encode(_app, uint256(0))), bytes32(_value));
    assertEq(vault.remainders(_app), _value, "remainder slot");
  }

  /// @dev Inbox steady state, as in the baseline: the ring has wrapped and the next measured message opens a bucket.
  function _warmInbox() internal {
    for (uint256 k = 1; k < 64; k++) {
      bytes32 base = keccak256(abi.encode(k, uint256(0)));
      vm.store(address(inbox), base, bytes32(uint256(0xdead)));
      vm.store(address(inbox), bytes32(uint256(base) + 1), bytes32(uint256(0xdead)));
    }
    inbox.sendL2Message(DataStructures.L2Actor(bytes32(uint256(1)), version), bytes32(uint256(1)), bytes32(0));
    _nextBlock();
  }

  function _nextBlock() internal {
    vm.warp(block.timestamp + 12);
    vm.roll(block.number + 1);
  }

  // ---------------------------------------------------------------- measurement

  function _tokens(bytes memory _cd) internal pure returns (uint256 zeros, uint256 nonzeros) {
    for (uint256 i = 0; i < _cd.length; i++) {
      if (_cd[i] == 0) {
        zeros++;
      } else {
        nonzeros++;
      }
    }
  }

  /// @dev Sends `_cd` to `_target` from `_from` as one isolated transaction and logs its gas breakdown.
  function _measure(string memory _label, address _from, address _target, bytes memory _cd)
    internal
    returns (uint256 total)
  {
    vm.prank(_from);
    (bool ok, bytes memory ret) = _target.call(_cd);
    if (!ok) {
      assembly {
        revert(add(ret, 0x20), mload(ret))
      }
    }
    total = vm.snapshotGasLastCall(_label);
    (uint256 zeros, uint256 nonzeros) = _tokens(_cd);
    uint256 tokens = zeros + 4 * nonzeros;
    bool floored = total == 21_000 + 10 * tokens;
    emit log_string(string.concat(
        "GAS | ",
        _label,
        " | total=",
        vm.toString(total),
        " | exec=",
        floored ? "floored" : vm.toString(total - 21_000 - 4 * tokens),
        " | calldataBytes=",
        vm.toString(_cd.length),
        " | tokens=",
        vm.toString(tokens)
      ));
  }

  // ---------------------------------------------------------------- Outbox

  function _requestMessage(bytes32 _requestId) internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(ESCROW_L2, version),
      recipient: DataStructures.L1Actor(address(vault), block.chainid),
      content: _requestId
    });
  }

  function _exitMessage(address _recipient) internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor(L2_BRIDGE, version),
      recipient: DataStructures.L1Actor(address(portal), block.chainid),
      content: Hash.sha256ToField(
        abi.encodeWithSignature("withdraw(address,uint256,address)", _recipient, EXIT_AMOUNT, address(0))
      )
    });
  }

  /**
   * @notice Inserts `_msgs` as leaves 0..n-1 of a fresh epoch tree of height H, plus a filler leaf that is consumed
   * right away so the epoch's nullifier bitmap word is already non-zero (steady state).
   */
  function _publish(DataStructures.L2ToL1Msg[] memory _msgs) internal returns (OutboxWitness[] memory witnesses) {
    uint256 n = _msgs.length;
    require(n < 2 ** H, "tree too small");
    Epoch epoch = Epoch.wrap(nextEpoch++);
    NaiveMerkle tree = new NaiveMerkle(H);
    for (uint256 i = 0; i < n; i++) {
      tree.insertLeaf(_msgs[i].sha256ToField());
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

    witnesses = new OutboxWitness[](n);
    for (uint256 i = 0; i < n; i++) {
      (bytes32[] memory path,) = tree.computeSiblingPath(i);
      witnesses[i] = OutboxWitness(epoch, 1, i, path);
    }
    (bytes32[] memory fillerPath,) = tree.computeSiblingPath(n);
    outbox.consume(filler, epoch, 1, n, fillerPath);
  }

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

  // ---------------------------------------------------------------- requests and calls

  function _request(address _target, Precondition memory _pre, bytes memory _prefix)
    internal
    returns (RelayRequest memory)
  {
    return RelayRequest({
      app: APP,
      target: _target,
      preconditionHash: RelayLib.preconditionHash(_pre.kind, _pre.params),
      prefixHash: keccak256(_prefix),
      gas: CALL_GAS,
      maxAztecPerGas: MAX_AZTEC_PER_GAS,
      tip: TIP,
      deadline: uint64(block.timestamp + 1 days),
      createdAt: uint64(block.timestamp - 1),
      salt: bytes32(nextSalt++)
    });
  }

  function _call(
    RelayRequest memory _r,
    Precondition memory _pre,
    bytes memory _prefix,
    bytes memory _suffix,
    bytes memory _witness
  ) internal pure returns (RelayCall memory) {
    return RelayCall({
      requestId: RelayLib.requestId(_r),
      target: _r.target,
      prefix: _prefix,
      suffix: _suffix,
      gasLimit: CALL_GAS,
      pre: _pre,
      witness: _witness
    });
  }

  /// @dev `_n` sweeps, each on its own contract (so each is a cold account) holding SWEEP_AMOUNT of the swept token.
  function _sweeps(uint256 _n, uint8 _kind) internal returns (RelayRequest[] memory reqs, RelayCall[] memory calls) {
    reqs = new RelayRequest[](_n);
    calls = new RelayCall[](_n);
    bytes memory prefix = abi.encodeCall(MockSweep.flip, ());
    for (uint256 i = 0; i < _n; i++) {
      MockSweep sweep = new MockSweep();
      sweepToken.mint(address(sweep), SWEEP_AMOUNT);
      Precondition memory pre = _kind == PRECONDITION_ERC20_BALANCE
        ? Precondition(PRECONDITION_ERC20_BALANCE, abi.encode(address(sweepToken), address(sweep), SWEEP_AMOUNT))
        : Precondition(PRECONDITION_NONE, "");
      reqs[i] = _request(address(sweep), pre, prefix);
      calls[i] = _call(reqs[i], pre, prefix, "", "");
    }
  }

  // ---------------------------------------------------------------- exits

  function _slice(bytes memory _b, uint256 _start, uint256 _end) internal pure returns (bytes memory r) {
    r = new bytes(_end - _start);
    for (uint256 i = 0; i < r.length; i++) {
      r[i] = _b[_start + i];
    }
  }

  /// @dev TokenPortal.withdraw calldata split after `_withCaller`: the request fixes selector, recipient, amount and
  /// withCaller (100 bytes); the relayer appends epoch, numCheckpoints, leafIndex, the path offset and the path.
  function _exitCalldata(address _recipient, OutboxWitness memory _w)
    internal
    pure
    returns (bytes memory prefix, bytes memory suffix)
  {
    bytes memory full = abi.encodeCall(
      TokenPortal.withdraw, (_recipient, EXIT_AMOUNT, false, _w.epoch, _w.numCheckpointsInEpoch, _w.leafIndex, _w.path)
    );
    prefix = _slice(full, 0, 100);
    suffix = _slice(full, 100, full.length);
  }

  function _exitPrecondition(uint8 _kind, address _recipient) internal view returns (Precondition memory) {
    if (_kind == PRECONDITION_OUTBOX_MESSAGE) {
      return Precondition(PRECONDITION_OUTBOX_MESSAGE, abi.encode(_exitMessage(_recipient).sha256ToField()));
    }
    return Precondition(PRECONDITION_NONE, "");
  }

  function _exitWitness(uint8 _kind, OutboxWitness memory _w) internal pure returns (bytes memory) {
    if (_kind == PRECONDITION_OUTBOX_MESSAGE) {
      return abi.encode(_w.epoch, _w.numCheckpointsInEpoch, _w.leafIndex, _w.path);
    }
    return "";
  }

  /// @dev The request for an exit depends only on the recipient and the precondition type, not on the exit's witness.
  function _exitRequest(uint8 _kind, address _recipient) internal returns (RelayRequest memory) {
    OutboxWitness memory dummy = OutboxWitness(Epoch.wrap(0), 0, 0, new bytes32[](0));
    (bytes memory prefix,) = _exitCalldata(_recipient, dummy);
    return _request(address(portal), _exitPrecondition(_kind, _recipient), prefix);
  }

  function _exitCall(uint8 _kind, address _recipient, RelayRequest memory _r, OutboxWitness memory _w)
    internal
    view
    returns (RelayCall memory)
  {
    (bytes memory prefix, bytes memory suffix) = _exitCalldata(_recipient, _w);
    require(keccak256(prefix) == _r.prefixHash, "prefix moved");
    return _call(_r, _exitPrecondition(_kind, _recipient), prefix, suffix, _exitWitness(_kind, _w));
  }

  function _fundPortal(uint256 _n) internal {
    // One extra unit stays behind so no exit drains the portal (a drain would earn a storage refund).
    vm.prank(token.owner());
    token.mint(address(portal), EXIT_AMOUNT * _n + 1);
  }

  // ---------------------------------------------------------------- receipts

  /// @dev Executes `_calls` (unmeasured, its own transaction) and returns each call's gasUsed from the events.
  function _execute(RelayCall[] memory _calls) internal returns (uint256[] memory gasUsed) {
    vm.recordLogs();
    vm.prank(RELAYER);
    executor.executeBatch(RELAYER, _calls);
    gasUsed = _gasUsedFromLogs(vm.getRecordedLogs(), _calls.length);
  }

  function _gasUsedFromLogs(Vm.Log[] memory _logs, uint256 _n) internal view returns (uint256[] memory gasUsed) {
    gasUsed = new uint256[](_n);
    uint256 k = 0;
    for (uint256 i = 0; i < _logs.length; i++) {
      if (_logs[i].emitter == address(executor) && _logs[i].topics[0] == RelayExecutor.CallExecuted.selector) {
        gasUsed[k++] = abi.decode(_logs[i].data, (uint256));
      }
    }
    require(k == _n, "not every call executed");
  }

  /// @dev Mirrors RelayLib.merkleRoot: at every level, nodes past the live count are zero.
  function _receiptWitnesses(RelayCall[] memory _calls, uint256[] memory _gasUsed)
    internal
    pure
    returns (ReceiptWitness[] memory witnesses)
  {
    uint256 n = _calls.length;
    bytes32[] memory leaves = new bytes32[](n);
    for (uint256 i = 0; i < n; i++) {
      bytes32 spec = RelayLib.spec(
        _calls[i].requestId,
        _calls[i].target,
        keccak256(_calls[i].prefix),
        RelayLib.preconditionHash(_calls[i].pre.kind, _calls[i].pre.params),
        CALL_GAS
      );
      leaves[i] = RelayLib.receiptLeaf(spec, _gasUsed[i]);
    }
    uint256 depth = 0;
    while ((1 << depth) < n) {
      depth++;
    }
    witnesses = new ReceiptWitness[](n);
    for (uint256 i = 0; i < n; i++) {
      witnesses[i] = ReceiptWitness(bytes32(0), CALL_GAS, _gasUsed[i], i, new bytes32[](depth));
    }
    bytes32[] memory level = leaves;
    uint256 live = n;
    for (uint256 d = 0; d < depth; d++) {
      for (uint256 i = 0; i < n; i++) {
        uint256 sib = (i >> d) ^ 1;
        witnesses[i].path[d] = sib < live ? level[sib] : bytes32(0);
      }
      uint256 width = 1 << (depth - d);
      bytes32[] memory next = new bytes32[](width / 2);
      for (uint256 j = 0; j < width / 2; j++) {
        bytes32 l = 2 * j < live ? level[2 * j] : bytes32(0);
        bytes32 r = 2 * j + 1 < live ? level[2 * j + 1] : bytes32(0);
        next[j] = keccak256(abi.encode(l, r));
      }
      level = next;
      live = (live + 1) / 2;
    }
    for (uint256 i = 0; i < n; i++) {
      witnesses[i].receiptsRoot = level[0];
    }
  }

  /// @dev What the vault should pay for one receipt: the oracle cost capped at maxAztecPerGas, plus the tip.
  function _expectedPayment(uint256 _gasUsed) internal view returns (uint256) {
    uint256 g = _gasUsed < CALL_GAS ? _gasUsed : CALL_GAS;
    uint256 cost = (g * BASE_FEE * 1e12 + ethPerFeeAsset - 1) / ethPerFeeAsset;
    uint256 cap = g * MAX_AZTEC_PER_GAS;
    return (cost < cap ? cost : cap) + TIP;
  }
}
