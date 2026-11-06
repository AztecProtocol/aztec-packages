// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {TokenPortal} from "../portals/TokenPortal.sol";
import {Multicall3} from "../benchmark/Multicall3.sol";

import {RelayExecutor} from "@aztec/relay-naive/RelayExecutor.sol";
import {RelayVault} from "@aztec/relay-naive/RelayVault.sol";
import {
  ClaimItem,
  OutboxWitness,
  Postcondition,
  ReceiptWitness,
  RelayCall,
  RelayLib,
  RelayRequest
} from "@aztec/relay-naive/RelayTypes.sol";

import {MockSweep} from "./MockSweep.sol";

/**
 * @notice Real Rollup, Inbox and Outbox from RollupBuilder, the real test TokenPortal as the exit target, and the naive
 * RelayVault and RelayExecutor. Outbox roots are inserted by impersonating the Rollup. Gas is measured as in the
 * approach 2 relay prototype: run with `--isolate` and read `vm.snapshotGasLastCall`, which is the full transaction
 * gas.
 */
contract RelayNaiveBase is Test {
  using Hash for DataStructures.L2ToL1Msg;

  uint256 internal constant H = 6;
  uint256 internal constant EXIT_AMOUNT = 1000e18;
  uint256 internal constant CLAIM_WINDOW = 7 days;
  uint256 internal constant CALL_GAS = 200_000;
  uint256 internal constant MAX_PAYMENT = 10e18;
  uint256 internal constant PRICE_PER_GAS = 1e12;
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
  TokenPortal internal portal;
  RelayExecutor internal executor;
  RelayVault internal vault;
  Multicall3 internal multicall;
  uint256 internal version;

  uint256 internal nextEpoch = 1;
  uint256 internal nextSalt = 1;

  function setUp() public virtual {
    RollupBuilder builder = new RollupBuilder(address(this));
    builder.deploy();
    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;
    inbox = Inbox(address(rollup.getInbox()));
    outbox = rollup.getOutbox();
    version = rollup.getVersion();

    portal = new TokenPortal();
    portal.initialize(address(registry), address(token), L2_BRIDGE);

    aztec = new TestERC20("Aztec", "AZTEC", address(this));
    executor = new RelayExecutor(rollup);
    vault = new RelayVault(aztec, rollup.getInbox(), outbox, executor, ESCROW_L2, version, CLAIM_WINDOW);
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

  /// @dev Inbox steady state, as in the approach 2 prototype: the ring has wrapped (opening a bucket overwrites
  /// non-zero slots) and the next measured message is the first of its L1 block (opens a new bucket).
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

  // ---------------------------------------------------------------- requests and calls

  function _request(address _target, Postcondition memory _post) internal returns (RelayRequest memory) {
    return RelayRequest({
      app: APP,
      target: _target,
      postconditionHash: RelayLib.postconditionHash(_post),
      minGas: CALL_GAS,
      maxPayment: MAX_PAYMENT,
      pricePerGas: PRICE_PER_GAS,
      tip: TIP,
      deadline: uint64(block.timestamp + 1 days),
      createdAt: uint64(block.timestamp - 1),
      salt: bytes32(nextSalt++)
    });
  }

  function _call(RelayRequest memory _r, bytes memory _data, Postcondition memory _post)
    internal
    pure
    returns (RelayCall memory)
  {
    return
      RelayCall({requestId: RelayLib.requestId(_r), target: _r.target, data: _data, gasLimit: CALL_GAS, post: _post});
  }

  function _sweepPost(MockSweep _sweep) internal view returns (Postcondition memory) {
    return Postcondition({
      target: address(_sweep), data: abi.encodeCall(_sweep.flag, ()), expectedHash: keccak256(abi.encode(true))
    });
  }

  /// @dev `_n` sweeps, each on its own contract (so each is a cold account), with their requests and calls.
  function _sweeps(uint256 _n) internal returns (RelayRequest[] memory reqs, RelayCall[] memory calls) {
    reqs = new RelayRequest[](_n);
    calls = new RelayCall[](_n);
    for (uint256 i = 0; i < _n; i++) {
      MockSweep sweep = new MockSweep();
      Postcondition memory post = _sweepPost(sweep);
      reqs[i] = _request(address(sweep), post);
      calls[i] = _call(reqs[i], abi.encodeCall(MockSweep.flip, ()), post);
    }
  }

  /// @dev One exit whose Outbox message is published together with the extra messages in `_alsoPublish`.
  struct Exit {
    address recipient;
    OutboxWitness witness;
    RelayRequest request;
    RelayCall call;
  }

  function _exitCall(Exit memory _e) internal view returns (RelayCall memory) {
    Postcondition memory post = Postcondition({
      target: address(outbox),
      data: abi.encodeCall(
        IOutbox.hasMessageBeenConsumedAtEpoch, (_e.witness.epoch, (1 << _e.witness.path.length) + _e.witness.leafIndex)
      ),
      expectedHash: keccak256(abi.encode(true))
    });
    bytes memory data = abi.encodeCall(
      TokenPortal.withdraw,
      (_e.recipient, EXIT_AMOUNT, false, _e.witness.epoch, 1, _e.witness.leafIndex, _e.witness.path)
    );
    return RelayCall({requestId: bytes32(0), target: address(portal), data: data, gasLimit: CALL_GAS, post: post});
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
      bytes32 spec =
        RelayLib.spec(_calls[i].requestId, _calls[i].target, RelayLib.postconditionHash(_calls[i].post), CALL_GAS);
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
}
