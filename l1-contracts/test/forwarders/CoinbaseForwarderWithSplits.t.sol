// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {PullSplitFactory} from "@splits/splitters/pull/PullSplitFactory.sol";
import {SplitsWarehouse} from "@splits/SplitsWarehouse.sol";
import {SplitV2Lib} from "@splits/libraries/SplitV2.sol";

import {
  CoinbaseForwarder, CoinbaseLocation
} from "@aztec/periphery/forwarders/CoinbaseForwarder.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";

import {DecoderBase} from "../base/DecoderBase.sol";
import {RollupBase, IInstance, IRollup, IRollupCore} from "../base/RollupBase.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @title CoinbaseForwarderWithSplits
 * @notice Test a forwarder that splits the coinbase rewards between multiple recipients
 *
 * This test inherits from the Rollup test to test the fee split logic end to end.
 */
contract CoinbaseForwarderWithSplits is RollupBase {
  using SlotLib for Slot;
  using EpochLib for Epoch;
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  PullSplitFactory splitFactory;
  address split;

  Registry internal registry;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  RewardDistributor internal rewardDistributor;

  address internal nodeOwner = address(bytes20("nodeOwner"));
  address internal nodeOperator = address(bytes20("nodeOperator"));

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;

  address internal sequencer = address(bytes20("sequencer"));

  constructor() {
    TimeLib.initialize(
      block.timestamp, TestConstants.AZTEC_SLOT_DURATION, TestConstants.AZTEC_EPOCH_DURATION
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;

    SplitsWarehouse warehouse = new SplitsWarehouse("eth", "eth");
    splitFactory = new PullSplitFactory(address(warehouse));
  }

  function setUp() public {}

  modifier setUpFor(string memory _name) {
    {
      testERC20 = new TestERC20("test", "TEST", address(this));

      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = Slot.unwrap(full.block.header.slotNumber);
      uint256 initialTime =
        Timestamp.unwrap(full.block.header.timestamp) - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    registry = new Registry(address(this), IERC20(address(testERC20)));
    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));

    testERC20.mint(address(rewardDistributor), 1e6 ether);

    rollup = IInstance(
      address(
        new Rollup(
          testERC20,
          rewardDistributor,
          testERC20,
          address(this),
          TestConstants.getGenesisState(),
          TestConstants.getRollupConfigInput()
        )
      )
    );

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));

    registry.addRollup(IRollup(address(rollup)));

    _;
  }

  function test_SplitCoinbase() public setUpFor("mixed_block_1") {
    // Create a split between the node operator and the deployer
    //
    // nodeOwner = 80%
    // nodeOperator = 20%
    address[] memory recipients = new address[](2);
    recipients[0] = nodeOwner;
    recipients[1] = nodeOperator;

    uint256[] memory allocations = new uint256[](2);
    allocations[0] = 80;
    allocations[1] = 20;

    uint256 totalAllocation = 100;

    SplitV2Lib.Split memory splitInstance = SplitV2Lib.Split({
      recipients: recipients,
      allocations: allocations,
      totalAllocation: totalAllocation,
      distributionIncentive: 0
    });

    split = splitFactory.createSplit(
      splitInstance,
      /*owner=*/
      nodeOwner,
      /*creator=*/
      address(this)
    );

    // Now that we have a split created, we can deploy a Coinbase Forwarder with the split address enforced as the coinbase

    // TODO: update permissions, the nodeOperator is the person calling it, but they should not have the power to update the coinbase locations / set the coinbase

    CoinbaseForwarder forwarder =
      new CoinbaseForwarder( /*owner=*/ nodeOperator, /*coinbase*/ split);

    // Set the coinbase location for this rollup - note, ideally this will be set by the deployer contract in a factory format
    CoinbaseLocation memory coinbaseLocation = CoinbaseLocation({
      contractAddress: address(rollup),
      offset: 0x240,
      proposeSignature: IRollupCore.propose.selector
    });

    // TODO: update to the nodeOwner
    vm.prank(nodeOperator);
    forwarder.setCoinbaseLocation(coinbaseLocation);

    // Call rollup.propose with custom forwarder args
    ProposeWithForwarderArgs memory forwarderArgs = ProposeWithForwarderArgs({
      enabled: true,
      overwriteCoinbase: true,
      forwarder: address(forwarder),
      sender: address(nodeOperator),
      setCoinbase: address(split)
    });
    _proposeBlockWithCustomForwarder("mixed_block_1", 1, forwarderArgs);

    // Check for fee updates to the split address

    // Prove the epoch, recieve the fees

    // Pull the split rewards
  }
}
