// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {DecoderBase} from "./Base.sol";

import {Hash} from "../../src/core/libraries/Hash.sol";

import {HeaderLibHelper} from "./helpers/HeaderLibHelper.sol";
import {TxsDecoderHelper} from "./helpers/TxsDecoderHelper.sol";
import {HeaderLib} from "../../src/core/libraries/HeaderLib.sol";
import {Constants} from "../../src/core/libraries/ConstantsGen.sol";

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 * All tests here are skipped (all tests are prefixed with an underscore)!
 * This is because we implicitly test the decoding in integration_l1_publisher.test.ts
 */
contract DecodersTest is DecoderBase {
  HeaderLibHelper internal headerHelper;
  TxsDecoderHelper internal txsHelper;

  function setUp() public virtual {
    headerHelper = new HeaderLibHelper();
    txsHelper = new TxsDecoderHelper();
  }

  function testDecodeBlocks() public {
    _testDecodeBlock("mixed_block_1");
    _testDecodeBlock("mixed_block_2");
    _testDecodeBlock("empty_block_1");
    _testDecodeBlock("empty_block_2");
  }

  function _testDecodeBlock(string memory name) public virtual {
    DecoderBase.Full memory data = load(name);

    // Header
    {
      DecoderBase.DecodedHeader memory referenceHeader = data.block.decodedHeader;
      HeaderLib.Header memory header = headerHelper.decode(data.block.header);

      // GlobalVariables
      {
        DecoderBase.GlobalVariables memory globalVariables = referenceHeader.globalVariables;

        assertEq(
          header.globalVariables.blockNumber, globalVariables.blockNumber, "Invalid block number"
        );
        assertEq(
          header.globalVariables.slotNumber, globalVariables.slotNumber, "Invalid slot number"
        );
        assertEq(header.globalVariables.chainId, globalVariables.chainId, "Invalid chain Id");
        assertEq(header.globalVariables.timestamp, globalVariables.timestamp, "Invalid timestamp");
        assertEq(header.globalVariables.version, globalVariables.version, "Invalid version");
        assertEq(header.globalVariables.coinbase, globalVariables.coinbase, "Invalid coinbase");
        assertEq(
          header.globalVariables.feeRecipient, globalVariables.feeRecipient, "Invalid feeRecipient"
        );
        assertEq(
          header.globalVariables.gasFees.feePerDaGas,
          globalVariables.gasFees.feePerDaGas,
          "Invalid gasFees.feePerDaGas"
        );
        assertEq(
          header.globalVariables.feeRecipient, globalVariables.feeRecipient, "Invalid feeRecipient"
        );
        assertEq(
          header.globalVariables.feeRecipient, globalVariables.feeRecipient, "Invalid feeRecipient"
        );
      }

      // ContentCommitment
      {
        DecoderBase.ContentCommitment memory contentCommitment = referenceHeader.contentCommitment;

        assertEq(header.contentCommitment.numTxs, contentCommitment.numTxs, "Invalid txTreeSize");
        assertEq(
          header.contentCommitment.txsEffectsHash,
          contentCommitment.txsEffectsHash,
          "Invalid txsEffectsHash"
        );
        assertEq(header.contentCommitment.inHash, contentCommitment.inHash, "Invalid inHash");
        assertEq(header.contentCommitment.outHash, contentCommitment.outHash, "Invalid outHash");
      }

      // StateReference
      {
        DecoderBase.StateReference memory stateReference = referenceHeader.stateReference;

        // L1 -> L2 messages
        assertEq(
          header.stateReference.l1ToL2MessageTree.nextAvailableLeafIndex,
          stateReference.l1ToL2MessageTree.nextAvailableLeafIndex,
          "Invalid l1ToL2MessageTree.nextAvailableLeafIndex"
        );
        assertEq(
          header.stateReference.l1ToL2MessageTree.root,
          stateReference.l1ToL2MessageTree.root,
          "Invalid l1ToL2MessageTree.root"
        );

        // PartialStateReference
        {
          DecoderBase.PartialStateReference memory partialStateReference =
            referenceHeader.stateReference.partialStateReference;

          // NoteHashTree
          assertEq(
            header.stateReference.partialStateReference.noteHashTree.nextAvailableLeafIndex,
            partialStateReference.noteHashTree.nextAvailableLeafIndex,
            "Invalid noteHashTree.nextAvailableLeafIndex"
          );
          assertEq(
            header.stateReference.partialStateReference.noteHashTree.root,
            partialStateReference.noteHashTree.root,
            "Invalid noteHashTree.root"
          );

          // NullifierTree
          assertEq(
            header.stateReference.partialStateReference.nullifierTree.nextAvailableLeafIndex,
            partialStateReference.nullifierTree.nextAvailableLeafIndex,
            "Invalid nullifierTree.nextAvailableLeafIndex"
          );
          assertEq(
            header.stateReference.partialStateReference.nullifierTree.root,
            partialStateReference.nullifierTree.root,
            "Invalid nullifierTree.root"
          );

          // PublicDataTree
          assertEq(
            header.stateReference.partialStateReference.publicDataTree.nextAvailableLeafIndex,
            partialStateReference.publicDataTree.nextAvailableLeafIndex,
            "Invalid publicDataTree.nextAvailableLeafIndex"
          );
          assertEq(
            header.stateReference.partialStateReference.publicDataTree.root,
            partialStateReference.publicDataTree.root,
            "Invalid publicDataTree.root"
          );
        }
      }

      assertEq(
        header.lastArchive.nextAvailableLeafIndex,
        referenceHeader.lastArchive.nextAvailableLeafIndex,
        "Invalid lastArchive.nextAvailableLeafIndex"
      );
      assertEq(
        header.lastArchive.root, referenceHeader.lastArchive.root, "Invalid lastArchive.root"
      );
    }

    // Txs
    {
      bytes32 txsEffectsHash = txsHelper.decode(data.block.body);
      assertEq(txsEffectsHash, data.block.txsEffectsHash, "Invalid txs effects hash");
      assertEq(
        txsEffectsHash,
        data.block.decodedHeader.contentCommitment.txsEffectsHash,
        "Invalid txs effects hash"
      );
    }

    // The public inputs are computed based of these values, but not directly part of the decoding per say.
  }

  function testComputeKernelLogsIterationWithoutLogs() public {
    bytes memory kernelLogsLength = hex"00000004"; // 4 bytes containing value 4
    bytes memory iterationLogsLength = hex"00000000"; // 4 empty bytes indicating that length of this iteration's logs is 0
    bytes memory encodedLogs = abi.encodePacked(kernelLogsLength, iterationLogsLength);

    (bytes32 logsHash, uint256 bytesAdvanced, uint256 logsLength) =
      txsHelper.computeKernelLogsHash(encodedLogs);

    assertEq(bytesAdvanced, encodedLogs.length, "Advanced by an incorrect number of bytes");
    assertEq(logsLength, 0, "Incorrect logs length");
    assertEq(logsHash, bytes32(0), "Incorrect logs hash");
  }

  function testComputeKernelLogs1Iteration() public {
    // || K_LOGS_LEN | I1_LOGS_LEN | I1_LOGS ||
    // K_LOGS_LEN = 4 + 8 = 12 (hex"0000000c")
    // I1_LOGS_LEN = 8 (hex"00000008")
    // I1_LOGS = 8 bytes (hex"0000000493e78a70")
    bytes memory firstFunctionCallLogs = hex"93e78a70";
    // First, prefix logs with a masked address to mimic siloing
    bytes32 maskedAddress = hex"11";
    // Prefix logs with length of kernel logs (12) and length of iteration 1 logs (8)
    // Note: 00000004 is the length of 1 log within function logs
    // Note: 00000024 is the length of 1 log plus its masked address
    bytes memory encodedLogs =
      abi.encodePacked(hex"0000002c00000028", hex"00000024", maskedAddress, firstFunctionCallLogs);
    (bytes32 logsHash, uint256 bytesAdvanced, uint256 logsLength) =
      txsHelper.computeKernelLogsHash(encodedLogs);

    bytes32 privateCircuitPublicInputsLogsHashFirstCall = Hash.sha256ToField(firstFunctionCallLogs);
    bytes32 privateCircuitPublicInputsLogsHashFirstCallSiloed =
      Hash.sha256ToField(bytes.concat(maskedAddress, privateCircuitPublicInputsLogsHashFirstCall));

    bytes32 referenceLogsHash = Hash.sha256ToField(
      abi.encodePacked(
        privateCircuitPublicInputsLogsHashFirstCallSiloed,
        new bytes(Constants.MAX_ENCRYPTED_LOGS_PER_TX * 32 - 32)
      )
    );

    assertEq(bytesAdvanced, encodedLogs.length, "Advanced by an incorrect number of bytes");
    // We take 40 as the user does not pay for the gas of the overall len or masked address
    assertEq(logsLength, encodedLogs.length - 40, "Incorrect logs length");
    assertEq(logsHash, referenceLogsHash, "Incorrect logs hash");
  }

  function testComputeKernelLogs2Iterations() public {
    // || K_LOGS_LEN | I1_LOGS_LEN | I1_LOGS | I2_LOGS_LEN | I2_LOGS ||
    // K_LOGS_LEN = 4 + 8 + 4 + 20 = 36 (hex"00000024")
    // I1_LOGS_LEN = 8 (hex"00000008")
    // I1_LOGS = 8 random bytes (hex"0000000493e78a70")
    // I2_LOGS_LEN = 20 (hex"00000014")
    // I2_LOGS = 20 bytes (hex"0000001006a86173c86c6d3f108eefc36e7fb014")
    bytes memory firstFunctionCallLogs = hex"93e78a70";
    // First, prefix logs with a masked address to mimic siloing
    bytes32 firstCallMaskedAddress = hex"11";
    bytes memory secondFunctionCallLogs = hex"06a86173c86c6d3f108eefc36e7fb014";
    bytes32 secondCallMaskedAddress = hex"12";
    bytes memory encodedLogs = abi.encodePacked(
      hex"0000006400000028",
      hex"00000024",
      firstCallMaskedAddress,
      firstFunctionCallLogs,
      hex"00000034",
      hex"00000030",
      secondCallMaskedAddress,
      secondFunctionCallLogs
    );
    (bytes32 logsHash, uint256 bytesAdvanced, uint256 logsLength) =
      txsHelper.computeKernelLogsHash(encodedLogs);

    bytes32 referenceLogsHashFromIteration1 = Hash.sha256ToField(firstFunctionCallLogs);
    bytes32 referenceLogsHashFromIteration1Siloed =
      Hash.sha256ToField(bytes.concat(firstCallMaskedAddress, referenceLogsHashFromIteration1));

    bytes32 privateCircuitPublicInputsLogsHashSecondCall =
      Hash.sha256ToField(secondFunctionCallLogs);
    bytes32 privateCircuitPublicInputsLogsHashSecondCallSiloed = Hash.sha256ToField(
      bytes.concat(secondCallMaskedAddress, privateCircuitPublicInputsLogsHashSecondCall)
    );

    bytes32 referenceLogsHashFromIteration2 = Hash.sha256ToField(
      abi.encodePacked(
        referenceLogsHashFromIteration1Siloed,
        privateCircuitPublicInputsLogsHashSecondCallSiloed,
        new bytes(Constants.MAX_ENCRYPTED_LOGS_PER_TX * 32 - 64)
      )
    );

    assertEq(bytesAdvanced, encodedLogs.length, "Advanced by an incorrect number of bytes");
    // We take 76 as the user does not pay for the gas of the parent len bytes or masked addresses
    assertEq(logsLength, encodedLogs.length - 76, "Incorrect logs length");
    assertEq(logsHash, referenceLogsHashFromIteration2, "Incorrect logs hash");
  }

  function testComputeKernelLogsMiddleIterationWithoutLogs() public {
    // || K_LOGS_LEN | I1_LOGS_LEN | I1_LOGS | I2_LOGS_LEN | I2_LOGS | I3_LOGS_LEN | I3_LOGS ||
    // K_LOGS_LEN = 4 + 8 + 4 + 0 + 4 + 20 = 40 (hex"00000028")
    // I1_LOGS_LEN = 8 (hex"00000008")
    // I1_LOGS = 8 random bytes (hex"0000000493e78a70")
    // I2_LOGS_LEN = 0 (hex"00000000")
    // I2_LOGS = 0 bytes (hex"")
    // I3_LOGS_LEN = 20 (hex"00000014")
    // I3_LOGS = 20 random bytes (hex"0000001006a86173c86c6d3f108eefc36e7fb014")
    bytes memory firstFunctionCallLogs = hex"93e78a70";
    // First, prefix logs with a masked address to mimic siloing
    bytes32 firstCallMaskedAddress = hex"11";
    bytes memory secondFunctionCallLogs = hex"";
    bytes memory thirdFunctionCallLogs = hex"06a86173c86c6d3f108eefc36e7fb014";
    bytes32 thirdCallMaskedAddress = hex"12";
    bytes memory encodedLogs = abi.encodePacked(
      hex"0000006800000028",
      hex"00000024",
      firstCallMaskedAddress,
      firstFunctionCallLogs,
      hex"00000000",
      secondFunctionCallLogs,
      hex"00000034",
      hex"00000030",
      thirdCallMaskedAddress,
      thirdFunctionCallLogs
    );
    (bytes32 logsHash, uint256 bytesAdvanced, uint256 logsLength) =
      txsHelper.computeKernelLogsHash(encodedLogs);

    bytes32 referenceLogsHashFromIteration1 = Hash.sha256ToField(firstFunctionCallLogs);
    bytes32 referenceLogsHashFromIteration1Siloed =
      Hash.sha256ToField(bytes.concat(firstCallMaskedAddress, referenceLogsHashFromIteration1));

    // Note: as of resolving #5017, we now hash logs inside the circuits
    // Following the YP, we skip any zero length logs, hence no use of secondFunctionCallLogs here

    bytes32 privateCircuitPublicInputsLogsHashThirdCall = Hash.sha256ToField(thirdFunctionCallLogs);
    bytes32 privateCircuitPublicInputsLogsHashThirdCallSiloed = Hash.sha256ToField(
      bytes.concat(thirdCallMaskedAddress, privateCircuitPublicInputsLogsHashThirdCall)
    );

    bytes32 referenceLogsHashFromIteration3 = Hash.sha256ToField(
      abi.encodePacked(
        referenceLogsHashFromIteration1Siloed,
        privateCircuitPublicInputsLogsHashThirdCallSiloed,
        new bytes(Constants.MAX_ENCRYPTED_LOGS_PER_TX * 32 - 64)
      )
    );

    assertEq(bytesAdvanced, encodedLogs.length, "Advanced by an incorrect number of bytes");
    // We take 80 as the user does not pay for the gas of the parent len bytes or masked addresses
    assertEq(logsLength, encodedLogs.length - 80, "Incorrect logs length");
    assertEq(logsHash, referenceLogsHashFromIteration3, "Incorrect logs hash");
  }

  function testComputeTxOutHash() public {
    // A tx with no msgs should give an out hash of 0
    bytes memory encodedMsgs = abi.encodePacked(hex"00");
    bytes32 outHash = txsHelper.computeTxOutHash(encodedMsgs);
    assertEq(outHash, 0, "Incorrect tx empty out hash");
    // Mimics test_3_elems test in .nr, with msg hashes of value 10, 11, and 12
    bytes32[3] memory msgs = [bytes32(hex"0a"), bytes32(hex"0b"), bytes32(hex"0c")];
    encodedMsgs = abi.encodePacked(hex"03", msgs);
    outHash = txsHelper.computeTxOutHash(encodedMsgs);
    bytes32 firstNode = Hash.sha256ToField(bytes.concat(msgs[0], msgs[1]));
    bytes32 secondNode = Hash.sha256ToField(bytes.concat(msgs[2], bytes32(0)));
    bytes32 expectedOutHash = Hash.sha256ToField(bytes.concat(firstNode, secondNode));
    assertEq(outHash, expectedOutHash, "Incorrect tx out hash");
  }

  function testTxsDecoderCorrectlyComputesNumTxEffectsToPad() public {
    // Minimum num txs is 2 so when there are no real txs we need to pad to 2
    uint32 numTxEffects = 0;
    uint32 paddedNumTxEffects = txsHelper.computeNumTxEffectsToPad(numTxEffects);
    assertEq(paddedNumTxEffects, 2, "Incorrect number of tx effects to pad");

    numTxEffects = 1;
    paddedNumTxEffects = txsHelper.computeNumTxEffectsToPad(numTxEffects);
    assertEq(paddedNumTxEffects, 2 ** 1 - numTxEffects, "Incorrect number of tx effects to pad");

    numTxEffects = 3;
    paddedNumTxEffects = txsHelper.computeNumTxEffectsToPad(numTxEffects);
    assertEq(paddedNumTxEffects, 0, "Incorrect number of tx effects to pad");

    numTxEffects = 17;
    paddedNumTxEffects = txsHelper.computeNumTxEffectsToPad(numTxEffects);
    assertEq(paddedNumTxEffects, 0, "Incorrect number of tx effects to pad");
  }

  function testTxsDecoderCorrectlyComputesNumMsgsToPad() public {
    uint32 numMsgs = 0;
    uint32 numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 1, "Incorrect number of msgs to pad");

    numMsgs = 1;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 2 ** 1 - numMsgs, "Incorrect number of msgs to pad");

    numMsgs = 2;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 0, "Incorrect number of msgs to pad");

    numMsgs = 3;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 2 ** 2 - numMsgs, "Incorrect number of msgs to pad");

    numMsgs = 4;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 0, "Incorrect number of msgs to pad");

    numMsgs = 5;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 2 ** 3 - numMsgs, "Incorrect number of msgs to pad");

    numMsgs = 6;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 2 ** 3 - numMsgs, "Incorrect number of msgs to pad");

    numMsgs = 7;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 2 ** 3 - numMsgs, "Incorrect number of msgs to pad");

    numMsgs = 7;
    numMsgsToPad = txsHelper.computeNumMsgsToPad(numMsgs);
    assertEq(numMsgsToPad, 2 ** 3 - numMsgs, "Incorrect number of msgs to pad");
  }
}
