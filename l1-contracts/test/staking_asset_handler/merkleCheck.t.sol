// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {MerkleTreeGetters} from "./merkle/merkle_tree_getters.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract MerkleCheck is StakingAssetHandlerBase, MerkleTreeGetters {
  // Generate with `node ./test/staking_asset_handler/merkle/get-root.js`
  bytes32 internal constant ROOT =
    0x9c6c9656a7180da61f979b48cb6f9f4d8d91d7f602e172bf8555a6a2d7aef935;

  function setUp() public override {
    super.setUp();

    // Set the merkle root based on the committed tree
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.DepositMerkleRootUpdated(ROOT);
    stakingAssetHandler.setDepositMerkleRoot(ROOT);

    // Check is disabled by default
    enableMerkleCheck();
  }

  // 1. Read the address at that index in the tree
  // 2. Get the merkle proof for that index in the tree
  /// forge-config: default.fuzz.runs = 10
  function test_WhenProvidingAValidMerkleProof(uint8 index) external {
    // it emits {AddedToQueue} event

    (address addr, bytes32[] memory merkleProof) = getAddressAndProof(index);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(staking), addr, WITHDRAWER);
    vm.prank(addr);
    stakingAssetHandler.addValidator(addr, merkleProof, realProof);
  }

  /// forge-config: default.fuzz.runs = 10
  function test_WhenNotProvidingAValidMerkleProof(uint8 index) external {
    // it reverts

    address addr = getAddress(index);
    // Wrong proof for address
    bytes32[] memory proof = getMerkleProof(uint16(index) + 1);

    vm.expectRevert(abi.encodeWithSelector(IStakingAssetHandler.MerkleProofInvalid.selector));
    vm.prank(addr);
    stakingAssetHandler.addValidator(addr, proof, realProof);
  }
}
