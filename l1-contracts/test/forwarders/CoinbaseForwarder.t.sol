// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";

import {
  CoinbaseForwarder, CoinbaseLocation
} from "@aztec/periphery/forwarders/CoinbaseForwarder.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {OracleInput} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {Header, ContentCommitment, GasFees} from "@aztec/core/libraries/rollup/HeaderLib.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";

import "forge-std/console.sol";

interface IMockRollup {
  event Proposed();
  event Voted();

  struct Calldata {
    address someStuff;
    address coinbase;
    bytes data;
  }

  struct DifferentCalldataStructure {
    address someStuff;
    address otherStuff;
    address coinbase;
    bytes data;
  }
}

contract MockRollup is IMockRollup {
  function propose(Calldata memory) external {
    emit Proposed();
  }

  function vote() external {
    emit Voted();
  }
}

contract MockRollupWithDifferentCalldataStructure is IMockRollup {
  function propose(DifferentCalldataStructure memory) external {
    emit Proposed();
  }

  function vote() external {
    emit Voted();
  }
}

contract MockRollupWithRealRollupCalldataStructure is IMockRollup {
  function propose(ProposeArgs calldata, Signature[] memory, bytes calldata) external {
    emit Proposed();
  }

  function vote() external {
    emit Voted();
  }
}

contract CoinbaseForwarderTest is TestBase {
  address public coinbase = address(0xcafe);
  MockRollup public rollup;

  function setUp() public {
    rollup = new MockRollup();
  }

  function test_revertsWhenNoCoinbaseLocationSet() public {
    // If no coinbase location is set, the forwarder should revert
    CoinbaseForwarder forwarder = new CoinbaseForwarder(address(this), coinbase);

    vm.expectRevert(CoinbaseForwarder.CoinbaseForwarder__NoCoinbaseLocationSet.selector);
    forwarder.forward(new address[](1), new bytes[](1));
  }

  function test_succeedsWhenCoinbaseLocationSet() public {
    CoinbaseForwarder forwarder = new CoinbaseForwarder(address(this), coinbase);

    CoinbaseLocation memory coinbaseLocation = CoinbaseLocation({
      contractAddress: address(rollup),
      proposeSignature: MockRollup.propose.selector,
      offset: 0x44 // correct offset in MockRollup.Calldata.coinbase
    });

    forwarder.setCoinbaseLocation(coinbaseLocation);

    // To
    address[] memory to = new address[](2);
    to[0] = address(rollup);
    to[1] = address(rollup);

    // Calldata
    IMockRollup.Calldata memory rollupCalldataOne = IMockRollup.Calldata({
      someStuff: address(0xbeef),
      coinbase: coinbase,
      data: bytes(string("something to put in the calldata"))
    });

    bytes[] memory data = new bytes[](2);
    data[0] = abi.encodeCall(MockRollup.propose, (rollupCalldataOne));
    data[1] = abi.encodeCall(MockRollup.vote, ());

    vm.expectEmit(false, false, false, false);
    emit IMockRollup.Proposed();
    forwarder.forward(to, data);

    // Update the forwarder to use the different calldata structure
    MockRollupWithDifferentCalldataStructure differentRollup =
      new MockRollupWithDifferentCalldataStructure();
    CoinbaseLocation memory differentCoinbaseLocation = CoinbaseLocation({
      contractAddress: address(differentRollup),
      proposeSignature: MockRollupWithDifferentCalldataStructure.propose.selector,
      offset: 0x64 // correct offset in MockRollup.Calldata.coinbase
    });

    forwarder.setCoinbaseLocation(differentCoinbaseLocation);

    // Update the calldata
    IMockRollup.DifferentCalldataStructure memory differentRollupCalldata = IMockRollup
      .DifferentCalldataStructure({
      someStuff: address(0xbeef),
      otherStuff: address(0xdead),
      coinbase: coinbase,
      data: bytes(string("something to put in the calldata"))
    });

    address[] memory differentTo = new address[](2);
    differentTo[0] = address(differentRollup);
    differentTo[1] = address(differentRollup);

    bytes[] memory differentData = new bytes[](2);
    differentData[0] = abi.encodeCall(MockRollupWithDifferentCalldataStructure.vote, ());
    differentData[1] =
      abi.encodeCall(MockRollupWithDifferentCalldataStructure.propose, (differentRollupCalldata));

    vm.expectEmit(false, false, false, false);
    emit IMockRollup.Proposed();
    forwarder.forward(differentTo, differentData);
  }

  function test_realProposeArgs() public {
    MockRollupWithRealRollupCalldataStructure realRollup =
      new MockRollupWithRealRollupCalldataStructure();

    CoinbaseForwarder forwarder = new CoinbaseForwarder(address(this), coinbase);

    CoinbaseLocation memory coinbaseLocation = CoinbaseLocation({
      contractAddress: address(realRollup),
      proposeSignature: MockRollupWithRealRollupCalldataStructure.propose.selector,
      // Note: in its current implementation this puts some very real constraints as to the location of the header
      offset: 0x244
    });

    forwarder.setCoinbaseLocation(coinbaseLocation);

    Header memory header = Header({
      lastArchiveRoot: bytes32(0),
      contentCommitment: ContentCommitment({
        numTxs: 0,
        blobsHash: bytes32(0),
        inHash: bytes32(0),
        outHash: bytes32(0)
      }),
      slotNumber: Slot.wrap(0),
      timestamp: Timestamp.wrap(0),
      coinbase: coinbase,
      feeRecipient: 0,
      gasFees: GasFees({feePerDaGas: 0, feePerL2Gas: 0}),
      totalManaUsed: 0
    });

    bytes memory sr = bytes(string("something else"));
    ProposeArgs memory args = ProposeArgs({
      archive: bytes32(0),
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput({feeAssetPriceModifier: 0}),
      header: header,
      txHashes: new bytes32[](0)
    });

    Signature[] memory sigs = new Signature[](0);
    bytes memory blobInput = bytes(string("blob input"));

    address[] memory to = new address[](1);
    to[0] = address(realRollup);

    bytes[] memory data = new bytes[](1);
    data[0] =
      abi.encodeCall(MockRollupWithRealRollupCalldataStructure.propose, (args, sigs, blobInput));

    console.logBytes(data[0]);

    vm.expectEmit(false, false, false, false);
    emit IMockRollup.Proposed();
    forwarder.forward(to, data);
  }
}
