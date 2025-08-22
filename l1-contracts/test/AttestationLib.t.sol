// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {
  AttestationLib, CommitteeAttestations, CommitteeAttestation
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract AttestationLibWrapper {
  using AttestationLib for CommitteeAttestations;

  function assertSizes(CommitteeAttestations memory _attestations, uint256 _expectedCount) external pure {
    AttestationLib.assertSizes(_attestations, _expectedCount);
  }

  function reconstructCommitteeFromSigners(
    CommitteeAttestations memory _attestations,
    address[] memory _signers,
    uint256 _length
  ) external pure returns (address[] memory) {
    return AttestationLib.reconstructCommitteeFromSigners(_attestations, _signers, _length);
  }

  function packAttestations(CommitteeAttestation[] memory _attestations)
    external
    pure
    returns (CommitteeAttestations memory)
  {
    return AttestationLib.packAttestations(_attestations);
  }
}

contract AttestationLibTest is TestBase {
  AttestationLibWrapper public attestationLibWrapper;

  uint256 internal constant SIZE = 48;

  CommitteeAttestations internal $attestations;
  uint256[SIZE] internal $privateKeys;
  address[SIZE] internal $committee;
  uint256 internal $signatureCount;

  function setUp() public {
    attestationLibWrapper = new AttestationLibWrapper();
  }

  modifier createValidAttestations(uint256 _signatureCount) {
    $signatureCount = bound(_signatureCount, 0, SIZE);

    for (uint256 i = 0; i < SIZE; i++) {
      $privateKeys[i] = uint256(keccak256(abi.encodePacked(i)));
      $committee[i] = vm.addr($privateKeys[i]);
    }

    CommitteeAttestation[] memory attestations = new CommitteeAttestation[](SIZE);
    bytes32 committeeCommitment = keccak256(abi.encodePacked($committee));

    // Produce signatures or address attestations
    for (uint256 i = 0; i < SIZE; i++) {
      if (i < $signatureCount) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign($privateKeys[i], committeeCommitment);
        attestations[i] = CommitteeAttestation({signature: Signature({v: v, r: r, s: s}), addr: address(0)});
      } else {
        attestations[i] = CommitteeAttestation({signature: Signature({v: 0, r: 0, s: 0}), addr: $committee[i]});
      }
    }

    $attestations = attestationLibWrapper.packAttestations(attestations);

    _;
  }

  function test_assertSizes(uint256 _signatureCount) public createValidAttestations(_signatureCount) {
    attestationLibWrapper.assertSizes($attestations, SIZE);
  }

  function test_assertSizes_wrongBitmapSize(uint256 _signatureCount, bool _over)
    public
    createValidAttestations(_signatureCount)
  {
    uint256 bitmapSize = $attestations.signatureIndices.length;
    if (_over) {
      $attestations.signatureIndices = new bytes(bitmapSize + 1);
    } else {
      $attestations.signatureIndices = new bytes(bitmapSize - 1);
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AttestationLib__SignatureIndicesSizeMismatch.selector, bitmapSize, $attestations.signatureIndices.length
      )
    );

    attestationLibWrapper.assertSizes($attestations, SIZE);
  }

  function test_assertSizes_wrongSignaturesOrAddressesSize(uint256 _signatureCount, bool _over)
    public
    createValidAttestations(_signatureCount)
  {
    uint256 dataSize = $attestations.signaturesOrAddresses.length;
    if (_over) {
      $attestations.signaturesOrAddresses = new bytes(dataSize + 1);
    } else {
      $attestations.signaturesOrAddresses = new bytes(dataSize - 1);
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AttestationLib__SignaturesOrAddressesSizeMismatch.selector,
        dataSize,
        $attestations.signaturesOrAddresses.length
      )
    );

    attestationLibWrapper.assertSizes($attestations, SIZE);
  }

  function test_reconstructCommitteeFromSigners(uint256 _signatureCount)
    public
    createValidAttestations(_signatureCount)
  {
    address[] memory committee =
      attestationLibWrapper.reconstructCommitteeFromSigners($attestations, getSigners(), SIZE);

    assertEq(committee.length, SIZE);

    // Check that the committee is correct
    for (uint256 i = 0; i < SIZE; i++) {
      assertEq(committee[i], $committee[i]);
    }
  }

  function test_reconstructCommitteeFromSigners_wrongBitmapSize(uint256 _signatureCount, bool _over)
    public
    createValidAttestations(_signatureCount)
  {
    uint256 bitmapSize = $attestations.signatureIndices.length;
    if (_over) {
      $attestations.signatureIndices = new bytes(bitmapSize + 1);
    } else {
      $attestations.signatureIndices = new bytes(bitmapSize - 1);
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AttestationLib__SignatureIndicesSizeMismatch.selector, bitmapSize, $attestations.signatureIndices.length
      )
    );

    attestationLibWrapper.reconstructCommitteeFromSigners($attestations, getSigners(), SIZE);
  }

  function test_reconstructCommitteeFromSigners_tooLittleData(uint256 _signatureCount)
    public
    createValidAttestations(_signatureCount)
  {
    uint256 dataSize = $attestations.signaturesOrAddresses.length;
    $attestations.signaturesOrAddresses = new bytes(dataSize - 1);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AttestationLib__OutOfBounds.selector, dataSize, $attestations.signaturesOrAddresses.length
      )
    );

    attestationLibWrapper.reconstructCommitteeFromSigners($attestations, getSigners(), SIZE);
  }

  function test_reconstructCommitteeFromSigners_wrongSignaturesOrAddressesSize(uint256 _signatureCount)
    public
    createValidAttestations(_signatureCount)
  {
    uint256 dataSize = $attestations.signaturesOrAddresses.length;
    $attestations.signaturesOrAddresses = new bytes(dataSize + 1);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AttestationLib__SignaturesOrAddressesSizeMismatch.selector,
        dataSize,
        $attestations.signaturesOrAddresses.length
      )
    );

    attestationLibWrapper.reconstructCommitteeFromSigners($attestations, getSigners(), SIZE);
  }

  function getSigners() internal view returns (address[] memory) {
    address[] memory signers = new address[]($signatureCount);
    for (uint256 i = 0; i < $signatureCount; i++) {
      signers[i] = $committee[i];
    }
    return signers;
  }
}
