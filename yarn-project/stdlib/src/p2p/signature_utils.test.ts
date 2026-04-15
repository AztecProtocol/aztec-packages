import { Buffer32 } from '@aztec/foundation/buffer';
import { keccak256, keccak256String } from '@aztec/foundation/crypto/keccak';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { hexToBuffer } from '@aztec/foundation/string';

import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { CommitteeAttestationsAndSigners } from '../block/proposal/attestations_and_signers.js';
import { CommitteeAttestation } from '../block/proposal/committee_attestation.js';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeAndSignCommitteeAttestationsAndSigners,
  makeBlockProposal,
  makeCheckpointAttestation,
  makeCheckpointProposal,
} from '../tests/mocks.js';
import type { Signable } from './signature_utils.js';
import {
  SignatureDomainSeparator,
  getHashedSignaturePayload,
  getHashedSignaturePayloadTypedData,
  recoverCoordinationSigner,
} from './signature_utils.js';

const DOMAIN_TYPEHASH = `0x${keccak256String(
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
)}` as const;
const NAME_HASH = `0x${keccak256String('Aztec Rollup')}` as const;
const VERSION_HASH = `0x${keccak256String('1')}` as const;

const TYPEHASHES = {
  [SignatureDomainSeparator.blockProposal]: `0x${keccak256String('BlockProposal(bytes32 payloadHash)')}`,
  [SignatureDomainSeparator.checkpointProposal]: `0x${keccak256String('CheckpointProposal(bytes32 payloadHash)')}`,
  [SignatureDomainSeparator.checkpointAttestation]: `0x${keccak256String('CheckpointAttestation(bytes32 payloadHash)')}`,
  [SignatureDomainSeparator.attestationsAndSigners]: `0x${keccak256String('AttestationsAndSigners(bytes32 payloadHash)')}`,
} as const;

const WRONG_CHAIN_CONTEXT = {
  ...TEST_COORDINATION_SIGNATURE_CONTEXT,
  chainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId + 1,
};

const WRONG_ROLLUP_CONTEXT = {
  ...TEST_COORDINATION_SIGNATURE_CONTEXT,
  rollupAddress: EthAddress.fromString('0x0000000000000000000000000000000000000002'),
};

type CoordinationSignatureDomain =
  | SignatureDomainSeparator.blockProposal
  | SignatureDomainSeparator.checkpointProposal
  | SignatureDomainSeparator.checkpointAttestation
  | SignatureDomainSeparator.attestationsAndSigners;

function getSolidityCoordinationDigest(signable: Signable, domainSeparator: CoordinationSignatureDomain): Buffer32 {
  const payloadHash = getHashedSignaturePayload(signable, domainSeparator);
  const domainSeparatorHash = Buffer32.fromBuffer(
    keccak256(
      hexToBuffer(
        encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,uint256,address'), [
          DOMAIN_TYPEHASH,
          NAME_HASH,
          VERSION_HASH,
          BigInt(TEST_COORDINATION_SIGNATURE_CONTEXT.chainId),
          TEST_COORDINATION_SIGNATURE_CONTEXT.rollupAddress.toString(),
        ]),
      ),
    ),
  );
  const structHash = Buffer32.fromBuffer(
    keccak256(
      hexToBuffer(
        encodeAbiParameters(parseAbiParameters('bytes32,bytes32'), [
          TYPEHASHES[domainSeparator],
          payloadHash.toString() as `0x${string}`,
        ]),
      ),
    ),
  );

  return Buffer32.fromBuffer(
    keccak256(Buffer.concat([Buffer.from('1901', 'hex'), domainSeparatorHash.toBuffer(), structHash.toBuffer()])),
  );
}

describe('coordination signature typed data', () => {
  it('matches the Solidity EIP-712 digest for all proposal-path message types', async () => {
    const signer = Secp256k1Signer.random();
    const blockProposal = await makeBlockProposal({ signer });
    const checkpointProposal = await makeCheckpointProposal({ signer });
    const checkpointAttestation = makeCheckpointAttestation({ signer });
    const attestationsAndSigners = new CommitteeAttestationsAndSigners([
      CommitteeAttestation.fromAddressAndSignature(signer.address, checkpointAttestation.signature),
    ]);

    expect(
      getHashedSignaturePayloadTypedData(
        blockProposal,
        SignatureDomainSeparator.blockProposal,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      ),
    ).toEqual(getSolidityCoordinationDigest(blockProposal, SignatureDomainSeparator.blockProposal));
    expect(
      getHashedSignaturePayloadTypedData(
        checkpointProposal,
        SignatureDomainSeparator.checkpointProposal,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      ),
    ).toEqual(getSolidityCoordinationDigest(checkpointProposal, SignatureDomainSeparator.checkpointProposal));
    expect(
      getHashedSignaturePayloadTypedData(
        checkpointAttestation.payload,
        SignatureDomainSeparator.checkpointAttestation,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      ),
    ).toEqual(
      getSolidityCoordinationDigest(checkpointAttestation.payload, SignatureDomainSeparator.checkpointAttestation),
    );
    expect(
      getHashedSignaturePayloadTypedData(
        attestationsAndSigners,
        SignatureDomainSeparator.attestationsAndSigners,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      ),
    ).toEqual(getSolidityCoordinationDigest(attestationsAndSigners, SignatureDomainSeparator.attestationsAndSigners));
  });

  it('recovers with the right context and changes sender for the wrong domain', async () => {
    const blockSigner = Secp256k1Signer.random();
    const checkpointSigner = Secp256k1Signer.random();
    const attesterSigner = Secp256k1Signer.random();
    const proposerSigner = Secp256k1Signer.random();
    const attestationsAndSignersSigner = Secp256k1Signer.random();

    const blockProposal = await makeBlockProposal({ signer: blockSigner });
    const checkpointProposal = await makeCheckpointProposal({
      signer: checkpointSigner,
    });
    const checkpointAttestation = makeCheckpointAttestation({
      attesterSigner,
      proposerSigner,
    });
    const attestationsAndSigners = new CommitteeAttestationsAndSigners([
      CommitteeAttestation.fromAddressAndSignature(attesterSigner.address, checkpointAttestation.signature),
    ]);
    const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
      attestationsAndSigners,
      attestationsAndSignersSigner,
    );

    expect(blockProposal.getSender(TEST_COORDINATION_SIGNATURE_CONTEXT)).toEqual(blockSigner.address);
    expect(blockProposal.getSender(WRONG_CHAIN_CONTEXT)).not.toEqual(blockSigner.address);
    expect(blockProposal.getSender(WRONG_ROLLUP_CONTEXT)).not.toEqual(blockSigner.address);

    expect(checkpointProposal.getSender(TEST_COORDINATION_SIGNATURE_CONTEXT)).toEqual(checkpointSigner.address);
    expect(checkpointProposal.getSender(WRONG_CHAIN_CONTEXT)).not.toEqual(checkpointSigner.address);
    expect(checkpointProposal.getSender(WRONG_ROLLUP_CONTEXT)).not.toEqual(checkpointSigner.address);

    expect(checkpointAttestation.getSender(TEST_COORDINATION_SIGNATURE_CONTEXT)).toEqual(attesterSigner.address);
    expect(checkpointAttestation.getProposer(TEST_COORDINATION_SIGNATURE_CONTEXT)).toEqual(proposerSigner.address);
    expect(checkpointAttestation.getSender(WRONG_CHAIN_CONTEXT)).not.toEqual(attesterSigner.address);
    expect(checkpointAttestation.getSender(WRONG_ROLLUP_CONTEXT)).not.toEqual(attesterSigner.address);
    expect(checkpointAttestation.getProposer(WRONG_CHAIN_CONTEXT)).not.toEqual(proposerSigner.address);
    expect(checkpointAttestation.getProposer(WRONG_ROLLUP_CONTEXT)).not.toEqual(proposerSigner.address);

    expect(
      recoverCoordinationSigner(
        attestationsAndSigners,
        SignatureDomainSeparator.attestationsAndSigners,
        attestationsAndSignersSignature,
        TEST_COORDINATION_SIGNATURE_CONTEXT,
      ),
    ).toEqual(attestationsAndSignersSigner.address);
    expect(
      recoverCoordinationSigner(
        attestationsAndSigners,
        SignatureDomainSeparator.attestationsAndSigners,
        attestationsAndSignersSignature,
        WRONG_CHAIN_CONTEXT,
      ),
    ).not.toEqual(attestationsAndSignersSigner.address);
    expect(
      recoverCoordinationSigner(
        attestationsAndSigners,
        SignatureDomainSeparator.attestationsAndSigners,
        attestationsAndSignersSignature,
        WRONG_ROLLUP_CONTEXT,
      ),
    ).not.toEqual(attestationsAndSignersSigner.address);
  });
});
