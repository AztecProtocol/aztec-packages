// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {SignatureLib, Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup, BlockLog} from "@aztec/core/Rollup.sol";
import {
  IRollup,
  IRollupCore,
  SubmitEpochRootProofArgs,
  PublicInputArgs,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {HeaderLib} from "@aztec/core/libraries/rollup/HeaderLib.sol";
import {
  ProposeArgs,
  ProposePayload,
  OracleInput,
  ProposeLib
} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {
  FeeLib,
  FeeAssetPerEthE9,
  EthValue,
  FeeHeader,
  L1FeeData,
  ManaBaseFeeComponents
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {
  FeeModelTestPoints,
  TestPoint,
  FeeHeaderModel,
  ManaBaseFeeComponentsModel
} from "test/fees/FeeModelTestPoints.t.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";
import {Forwarder} from "@aztec/periphery/Forwarder.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";

// solhint-disable comprehensive-interface

uint256 constant MANA_TARGET = 1e8;

contract FakeCanonical is IRewardDistributor {
  uint256 public constant BLOCK_REWARD = 50e18;
  IERC20 public immutable UNDERLYING;

  address public canonicalRollup;

  constructor(IERC20 _asset) {
    UNDERLYING = _asset;
  }

  function setCanonicalRollup(address _rollup) external {
    canonicalRollup = _rollup;
  }

  function claim(address _recipient) external returns (uint256) {
    TestERC20(address(UNDERLYING)).mint(_recipient, BLOCK_REWARD);
    return BLOCK_REWARD;
  }

  function claimBlockRewards(address _recipient, uint256 _blocks) external returns (uint256) {
    TestERC20(address(UNDERLYING)).mint(_recipient, _blocks * BLOCK_REWARD);
    return _blocks * BLOCK_REWARD;
  }

  function distributeFees(address _recipient, uint256 _amount) external {
    TestERC20(address(UNDERLYING)).mint(_recipient, _amount);
  }

  function updateRegistry(IRegistry _registry) external {}
}

contract BenchmarkRollupTest is FeeModelTestPoints, DecoderBase {
  using MessageHashUtils for bytes32;
  using stdStorage for StdStorage;
  using TimeLib for Slot;

  using SlotLib for Slot;
  using EpochLib for Epoch;
  using FeeLib for uint256;
  using FeeLib for ManaBaseFeeComponents;
  // We need to build a block that we can submit. We will be using some values from
  // the empty blocks, but otherwise populate using the fee model test points.

  struct Block {
    ProposeArgs proposeArgs;
    bytes blobInputs;
    Signature[] signatures;
  }

  DecoderBase.Full full = load("empty_block_1");

  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;

  Rollup internal rollup;

  address internal coinbase = address(bytes20("MONEY MAKER"));
  TestERC20 internal asset;
  FakeCanonical internal fakeCanonical;

  Signature internal emptySignature;
  mapping(address attester => uint256 privateKey) internal attesterPrivateKeys;
  mapping(address proposer => address attester) internal proposerToAttester;

  Forwarder internal baseForwarder = new Forwarder(address(this));

  modifier prepare(uint256 _validatorCount) {
    // We deploy a the rollup and sets the time and all to
    vm.warp(l1Metadata[0].timestamp - SLOT_DURATION);

    RollupBuilder builder = new RollupBuilder(address(this)).setProvingCostPerMana(provingCost)
      .setManaTarget(MANA_TARGET).setSlotDuration(SLOT_DURATION).setEpochDuration(EPOCH_DURATION)
      .setProofSubmissionWindow(EPOCH_DURATION * 2 - 1).setMintFeeAmount(1e30);
    builder.deploy();

    asset = builder.getConfig().testERC20;
    rollup = builder.getConfig().rollup;

    vm.label(coinbase, "coinbase");
    vm.label(address(rollup), "ROLLUP");
    vm.label(address(asset), "ASSET");
    vm.label(rollup.getBurnAddress(), "BURN_ADDRESS");

    // We are going to set up all of the validators
    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](_validatorCount);

    for (uint256 i = 1; i < _validatorCount + 1; i++) {
      uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", i)));
      address attester = vm.addr(attesterPrivateKey);
      attesterPrivateKeys[attester] = attesterPrivateKey;

      address proposer = address(new Forwarder(attester));

      proposerToAttester[proposer] = attester;

      initialValidators[i - 1] = CheatDepositArgs({
        attester: attester,
        proposer: proposer,
        withdrawer: address(this),
        amount: TestConstants.AZTEC_MINIMUM_STAKE
      });
    }

    MultiAdder multiAdder = new MultiAdder(address(rollup), address(this));
    asset.mint(address(multiAdder), TestConstants.AZTEC_MINIMUM_STAKE * _validatorCount);
    multiAdder.addValidators(initialValidators);

    _;
  }

  constructor() {
    FeeLib.initialize(MANA_TARGET, EthValue.wrap(100));
  }

  function _loadL1Metadata(uint256 index) internal {
    vm.roll(l1Metadata[index].block_number);
    vm.warp(l1Metadata[index].timestamp);
  }

  function test_no_validators() public prepare(0) {
    benchmark();
  }

  function test_48_validators() public prepare(48) {
    benchmark();
  }

  function test_100_validators() public prepare(100) {
    benchmark();
  }

  /**
   * @notice Constructs a fake block that is not possible to prove, but passes the L1 checks.
   */
  function getBlock() internal returns (Block memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);

    bytes32[] memory txHashes = new bytes32[](0);

    bytes memory header = full.block.header;

    Slot slotNumber = rollup.getCurrentSlot();
    TestPoint memory point = points[slotNumber.unwrap() - 1];

    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    uint256 manaBaseFee = rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true);
    uint256 manaSpent = point.block_header.mana_spent;

    address proposer = rollup.getCurrentProposer();

    // Updating the header with important information!
    header = DecoderBase.updateHeaderArchive(header, archiveRoot);
    header = DecoderBase.updateHeaderSlot(header, slotNumber);
    header = DecoderBase.updateHeaderTimestamp(header, ts);
    header = DecoderBase.updateHeaderCoinbase(header, proposer);
    header = DecoderBase.updateHeaderFeeRecipient(header, address(0));
    header = DecoderBase.updateHeaderBaseFee(header, manaBaseFee);
    header = DecoderBase.updateHeaderManaUsed(header, manaSpent);

    ProposeArgs memory proposeArgs = ProposeArgs({
      header: header,
      archive: archiveRoot,
      stateReference: new bytes(0),
      oracleInput: OracleInput({feeAssetPriceModifier: point.oracle_input.fee_asset_price_modifier}),
      txHashes: txHashes
    });

    Signature[] memory signatures;

    {
      address[] memory validators = rollup.getEpochCommittee(rollup.getCurrentEpoch());
      uint256 needed = validators.length * 2 / 3 + 1;
      signatures = new Signature[](validators.length);

      bytes32 headerHash = HeaderLib.hash(proposeArgs.header);

      ProposePayload memory proposePayload = ProposePayload({
        archive: proposeArgs.archive,
        stateReference: proposeArgs.stateReference,
        oracleInput: proposeArgs.oracleInput,
        headerHash: headerHash,
        txHashes: proposeArgs.txHashes
      });

      bytes32 digest = ProposeLib.digest(proposePayload);

      for (uint256 i = 0; i < validators.length; i++) {
        if (i < needed) {
          signatures[i] = createSignature(validators[i], digest);
        } else {
          signatures[i] = Signature({isEmpty: true, v: 0, r: 0, s: 0});
        }
      }
    }

    return
      Block({proposeArgs: proposeArgs, blobInputs: full.block.blobInputs, signatures: signatures});
  }

  function createSignature(address _signer, bytes32 _digest)
    internal
    view
    returns (Signature memory)
  {
    uint256 privateKey = attesterPrivateKeys[_signer];

    bytes32 digest = _digest.toEthSignedMessageHash();
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);

    return Signature({isEmpty: false, v: v, r: r, s: s});
  }

  function benchmark() public {
    // Do nothing for the first epoch
    Slot nextSlot = Slot.wrap(EPOCH_DURATION + 1);
    Epoch nextEpoch = Epoch.wrap(2);

    // Loop through all of the L1 metadata
    for (uint256 i = 0; i < l1Metadata.length; i++) {
      if (rollup.getPendingBlockNumber() >= 100) {
        break;
      }

      _loadL1Metadata(i);

      // For every "new" slot we encounter, we construct a block using current L1 Data
      // and part of the `empty_block_1.json` file. The block cannot be proven, but it
      // will be accepted as a proposal so very useful for testing a long range of blocks.
      if (rollup.getCurrentSlot() == nextSlot) {
        rollup.setupEpoch();

        Block memory b = getBlock();
        address proposer = rollup.getCurrentProposer();

        skipBlobCheck(address(rollup));

        address[] memory targets = new address[](1);
        targets[0] = address(rollup);

        bytes[] memory data = new bytes[](1);
        data[0] = abi.encodeCall(IRollupCore.propose, (b.proposeArgs, b.signatures, b.blobInputs));

        if (proposer == address(0)) {
          baseForwarder.forward(targets, data);
        } else {
          address caller = proposerToAttester[proposer];
          vm.prank(caller);
          Forwarder(proposer).forward(targets, data);
        }

        nextSlot = nextSlot + Slot.wrap(1);
      }

      // If we are entering a new epoch, we will post a proof
      // Ensure that the fees are split correctly between sequencers and burns etc.
      if (rollup.getCurrentEpoch() == nextEpoch) {
        nextEpoch = nextEpoch + Epoch.wrap(1);
        uint256 pendingBlockNumber = rollup.getPendingBlockNumber();
        uint256 start = rollup.getProvenBlockNumber() + 1;
        uint256 epochSize = 0;
        while (
          start + epochSize <= pendingBlockNumber
            && rollup.getEpochForBlock(start) == rollup.getEpochForBlock(start + epochSize)
        ) {
          epochSize++;
        }

        bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

        for (uint256 feeIndex = 0; feeIndex < epochSize; feeIndex++) {
          // we need the basefee, and we cannot just take it from the point. Because it is different
          Timestamp ts = rollup.getTimestampForSlot(Slot.wrap(start + feeIndex));
          uint256 manaBaseFee = rollup.getManaBaseFeeAt(ts, true);
          uint256 fee = rollup.getFeeHeader(start + feeIndex).manaUsed * manaBaseFee;

          fees[feeIndex * 2] = bytes32(uint256(uint160(bytes20(coinbase))));
          fees[feeIndex * 2 + 1] = bytes32(fee);
        }

        PublicInputArgs memory args = PublicInputArgs({
          previousArchive: rollup.getBlock(start).archive,
          endArchive: rollup.getBlock(start + epochSize - 1).archive,
          endTimestamp: Timestamp.wrap(0),
          outHash: bytes32(0),
          proverId: address(0)
        });

        bytes memory blobPublicInputs;
        for (uint256 j = 0; j < epochSize; j++) {
          // For each block in the epoch, add its blob public inputs
          // Since we are reusing the same block, they are the same
          blobPublicInputs =
            abi.encodePacked(blobPublicInputs, this.getBlobPublicInputs(full.block.blobInputs));
        }

        {
          rollup.submitEpochRootProof(
            SubmitEpochRootProofArgs({
              start: start,
              end: start + epochSize - 1,
              args: args,
              fees: fees,
              blobPublicInputs: blobPublicInputs,
              proof: ""
            })
          );
        }
      }
    }
  }

  // This is duplicated from Rollup.t.sol because we need to call it as this.getBlobPublicInputs
  // so it accepts the input as calldata
  function getBlobPublicInputs(bytes calldata _blobsInput)
    public
    pure
    returns (bytes memory blobPublicInputs)
  {
    uint8 numBlobs = uint8(_blobsInput[0]);
    blobPublicInputs = abi.encodePacked(numBlobs, blobPublicInputs);
    for (uint256 i = 0; i < numBlobs; i++) {
      // Add 1 for the numBlobs prefix
      uint256 blobInputStart = i * 192 + 1;
      // We want to extract the bytes we use for public inputs:
      //  * input[32:64]   - z
      //  * input[64:96]   - y
      //  * input[96:144]  - commitment C
      // Out of 192 bytes per blob.
      blobPublicInputs =
        abi.encodePacked(blobPublicInputs, _blobsInput[blobInputStart + 32:blobInputStart + 144]);
    }
  }
}
