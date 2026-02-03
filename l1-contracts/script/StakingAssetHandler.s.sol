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
import {RegisterNewRollupVersionPayload} from "../test/governance/scenario/RegisterNewRollupVersionPayload.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Fakerollup} from "../test/governance/governance-proposer/mocks/Fakerollup.sol";
import {StakingAssetHandler} from "../src/mock/StakingAssetHandler.sol";
import {FeeAssetHandler} from "../src/mock/FeeAssetHandler.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {ZKPassportRootVerifier as ZKPassportVerifier} from "@zkpassport/ZKPassportRootVerifier.sol";

// NOTE: The values below are for the testnet on sepolia, deployed initially with `v3` in December 2025.
contract StakingAssetHandlerScript is Test {
  address internal constant ME = address(0xdfe19Da6a717b7088621d8bBB66be59F2d78e924);

  string internal constant DOMAIN = "testnet.aztec.network";
  string internal constant SCOPE = "personhood";

  ZKPassportVerifier internal constant zkPassportVerifier =
    ZKPassportVerifier(0x1D000001000EFD9a6371f4d90bB8920D5431c0D8);

  TestERC20 public constant stakingAsset = TestERC20(0x5595cb9ED193cAc2C0Bc5393313bc6115817954B);
  IRegistry public constant registry = IRegistry(0xA0BFb1B494FB49041e5c6e8c2C1BE09cD171c6Ba);

  function setUp() public {}

  function deploy() public {
    address amin = 0x3b218d0F26d15B36C715cB06c949210a0d630637;
    address koen = 0xEfDb4C5f3a2f04e0cb393725bCAE2DD675cC3718;

    address[] memory unhingedAddresses = new address[](2);
    unhingedAddresses[0] = amin;
    unhingedAddresses[1] = koen;

    StakingAssetHandler.StakingAssetHandlerArgs memory stakingAssetHandlerArgs =
      StakingAssetHandler.StakingAssetHandlerArgs({
        owner: ME,
        stakingAsset: address(stakingAsset),
        registry: registry,
        faucetAmount: 1_000_000 * 1e18, // 1M STK
        zkPassportVerifier: zkPassportVerifier,
        unhinged: unhingedAddresses,
        domain: DOMAIN,
        scope: SCOPE,
        skipBindCheck: false // DO NOT: skip bind check
      });

    vm.startBroadcast(ME);
    StakingAssetHandler stakingAssetHandler = new StakingAssetHandler(stakingAssetHandlerArgs);
    vm.stopBroadcast();

    emit log_named_address("StakingAssetHandler deployed", address(stakingAssetHandler));
  }
}
