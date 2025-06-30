// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Governance, DataStructures} from "@aztec/governance/Governance.sol";
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
  using ProposalLib for DataStructures.Proposal;

  address internal constant ME = address(0xf8d7d601759CBcfB78044bA7cA9B0c0D6301A54f);

  string internal constant SCOPE = "testnet.aztec.network";
  string internal constant SUBSCOPE = "personhood";

  bytes32 public constant DEPOSIT_MERKLE_ROOT = bytes32(0xbf26b7f1dbcc49b6e063b891f576173aa61d44813a54a4796f505123563ff00f);

  ZKPassportVerifier internal constant zkPassportVerifier =
    ZKPassportVerifier(0xEE9F10f38319eAE2730dBa28fB09081dB806c5E5);

  TestERC20 public constant stakingAsset = TestERC20(0x5C30c66847866A184ccb5197cBE31Fce7A92eB26);
  IRegistry public constant registry = IRegistry(0x4d2cC1d5fb6BE65240e0bFC8154243e69c0Fb19E);

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
      scope: SCOPE,
      subscope: SUBSCOPE,
      skipBindCheck: false, // DO NOT: skip bind check
      skipMerkleCheck: false // DO NOT: skip merkle check
    });

    vm.startBroadcast(ME);
    StakingAssetHandler stakingAssetHandler = new StakingAssetHandler(stakingAssetHandlerArgs);
    stakingAsset.addMinter(address(stakingAssetHandler));
    vm.stopBroadcast();

    emit log_named_address("StakingAssetHandler deployed", address(stakingAssetHandler));
  }

  function updateRoot() public {
    // Localhost
    StakingAssetHandler stakingAssetHandler = StakingAssetHandler(0x74d4A0ECE61e5e941878667f05E334439F4f39cB);
    // Real
    // StakingAssetHandler stakingAssetHandler = StakingAssetHandler(0xfF50D061d23962E841d7FaF6495A1FCBBDa1BB9C);

    vm.startBroadcast();
    stakingAssetHandler.setDepositMerkleRoot(DEPOSIT_MERKLE_ROOT);
  }
}
