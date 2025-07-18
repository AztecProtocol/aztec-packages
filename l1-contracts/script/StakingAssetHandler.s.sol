// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegisterNewRollupVersionPayload} from
  "../test/governance/scenario/RegisterNewRollupVersionPayload.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Fakerollup} from "../test/governance/governance-proposer/mocks/Fakerollup.sol";
import {StakingAssetHandler} from "../src/mock/StakingAssetHandler.sol";
import {FeeAssetHandler} from "../src/mock/FeeAssetHandler.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";

contract StakingAssetHandlerScript is Test {
  address internal constant ME = address(0xBb2DCf57bB62B9f2C8011dF94D58d4ab9964edb6);

  string internal constant DOMAIN = "localhost";
  string internal constant SCOPE = "personhood"; // this is the scope set in the JS SDK

  bytes32 public constant DEPOSIT_MERKLE_ROOT = bytes32(0);

  ZKPassportVerifier internal constant zkPassportVerifier =
    ZKPassportVerifier(0x62e33cC35e29130e135341586e8Cf9C2BAbFB3eE);

  TestERC20 public constant stakingAsset = TestERC20(0x19355a3Baf6313eF818f6bA8f708C3776C41F883);
  IRegistry public constant registry = IRegistry(0xe0Ae427123986029DAA4a34b5Cf4F35125881457);

  function setUp() public {}

  function deploy() public {
    address amin = 0x3b218d0F26d15B36C715cB06c949210a0d630637;

    address[] memory isUnhinged = new address[](1);
    isUnhinged[0] = amin;

    StakingAssetHandler.StakingAssetHandlerArgs memory stakingAssetHandlerArgs = StakingAssetHandler
      .StakingAssetHandlerArgs({
      owner: ME,
      stakingAsset: address(stakingAsset),
      registry: registry,
      withdrawer: amin,
      mintInterval: 60 * 60 * 24,
      depositsPerMint: 10,
      depositMerkleRoot: DEPOSIT_MERKLE_ROOT,
      zkPassportVerifier: zkPassportVerifier,
      unhinged: isUnhinged,
      domain: DOMAIN,
      scope: SCOPE,
      skipBindCheck: true, // DO NOT: skip bind check
      skipMerkleCheck: true // DO NOT: skip merkle check
    });

    vm.startBroadcast(ME);
    StakingAssetHandler stakingAssetHandler = new StakingAssetHandler(stakingAssetHandlerArgs);
    // stakingAsset.addMinter(address(stakingAssetHandler));
    vm.stopBroadcast();

    emit log_named_address("StakingAssetHandler deployed", address(stakingAssetHandler));
  }
}
