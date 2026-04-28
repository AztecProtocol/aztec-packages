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
import { CheckpointAttestation } from './checkpoint_attestation.js';
import type { CoordinationSignatureType, Signable } from './signature_utils.js';
import {
  getHashedSignaturePayload,
  getHashedSignaturePayloadTypedData,
  recoverCoordinationSigner,
} from './signature_utils.js';

const DOMAIN_TYPEHASH = `0x${keccak256String(
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)',
)}` as const;
const NAME_HASH = `0x${keccak256String('Aztec Rollup')}` as const;
const VERSION_HASH = `0x${keccak256String('1')}` as const;

const TYPEHASHES: Record<CoordinationSignatureType, `0x${string}`> = {
  BlockProposal: `0x${keccak256String('BlockProposal(bytes32 payloadHash)')}`,
  CheckpointProposal: `0x${keccak256String('CheckpointProposal(bytes32 payloadHash)')}`,
  CheckpointAttestation: `0x${keccak256String('CheckpointAttestation(bytes32 payloadHash)')}`,
  AttestationsAndSigners: `0x${keccak256String('AttestationsAndSigners(bytes32 payloadHash)')}`,
  SignedTxs: `0x${keccak256String('SignedTxs(bytes32 payloadHash)')}`,
};

const WRONG_CHAIN_CONTEXT = {
  ...TEST_COORDINATION_SIGNATURE_CONTEXT,
  chainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId + 1,
};

const WRONG_ROLLUP_CONTEXT = {
  ...TEST_COORDINATION_SIGNATURE_CONTEXT,
  rollupAddress: EthAddress.fromString('0x0000000000000000000000000000000000000002'),
};

function getSolidityCoordinationDigest(signable: Signable): Buffer32 {
  const payloadHash = getHashedSignaturePayload(signable);
  const domainSeparatorHash = Buffer32.fromBuffer(
    keccak256(
      hexToBuffer(
        encodeAbiParameters(parseAbiParameters('bytes32,bytes32,bytes32,uint256,address'), [
          DOMAIN_TYPEHASH,
          NAME_HASH,
          VERSION_HASH,
          BigInt(signable.signatureContext.chainId),
          signable.signatureContext.rollupAddress.toString(),
        ]),
      ),
    ),
  );
  const structHash = Buffer32.fromBuffer(
    keccak256(
      hexToBuffer(
        encodeAbiParameters(parseAbiParameters('bytes32,bytes32'), [
          TYPEHASHES[signable.primaryType],
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
    const attestationsAndSigners = new CommitteeAttestationsAndSigners(
      [CommitteeAttestation.fromAddressAndSignature(signer.address, checkpointAttestation.signature)],
      TEST_COORDINATION_SIGNATURE_CONTEXT,
    );

    expect(getHashedSignaturePayloadTypedData(blockProposal)).toEqual(getSolidityCoordinationDigest(blockProposal));
    expect(getHashedSignaturePayloadTypedData(checkpointProposal)).toEqual(
      getSolidityCoordinationDigest(checkpointProposal),
    );
    expect(getHashedSignaturePayloadTypedData(checkpointAttestation.payload)).toEqual(
      getSolidityCoordinationDigest(checkpointAttestation.payload),
    );
    expect(getHashedSignaturePayloadTypedData(attestationsAndSigners)).toEqual(
      getSolidityCoordinationDigest(attestationsAndSigners),
    );
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
    const attestationsAndSigners = new CommitteeAttestationsAndSigners(
      [CommitteeAttestation.fromAddressAndSignature(attesterSigner.address, checkpointAttestation.signature)],
      TEST_COORDINATION_SIGNATURE_CONTEXT,
    );
    const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
      attestationsAndSigners,
      attestationsAndSignersSigner,
    );

    // Helpers to create variants of the same signables but with the wrong context baked in.
    // Reset any memoized sender/proposer so the copy re-derives them against the altered context.
    const withContext = <T extends { signatureContext: unknown }>(
      signable: T,
      ctx: typeof TEST_COORDINATION_SIGNATURE_CONTEXT,
    ): T => {
      const copy = Object.create(Object.getPrototypeOf(signable));
      Object.assign(copy, signable);
      copy.signatureContext = ctx;
      if ('cachedSender' in copy) {
        copy.cachedSender = undefined;
      }
      if ('cachedProposer' in copy) {
        copy.cachedProposer = undefined;
      }
      return copy;
    };

    expect(blockProposal.getSender()).toEqual(blockSigner.address);
    expect(withContext(blockProposal, WRONG_CHAIN_CONTEXT).getSender()).not.toEqual(blockSigner.address);
    expect(withContext(blockProposal, WRONG_ROLLUP_CONTEXT).getSender()).not.toEqual(blockSigner.address);

    expect(checkpointProposal.getSender()).toEqual(checkpointSigner.address);
    expect(withContext(checkpointProposal, WRONG_CHAIN_CONTEXT).getSender()).not.toEqual(checkpointSigner.address);
    expect(withContext(checkpointProposal, WRONG_ROLLUP_CONTEXT).getSender()).not.toEqual(checkpointSigner.address);

    expect(checkpointAttestation.getSender()).toEqual(attesterSigner.address);
    expect(checkpointAttestation.getProposer()).toEqual(proposerSigner.address);
    // To change the context on a CheckpointAttestation, we need to swap the embedded payload's context.
    const wrongChainAttestation = new CheckpointAttestation(
      withContext(checkpointAttestation.payload, WRONG_CHAIN_CONTEXT),
      checkpointAttestation.signature,
      checkpointAttestation.proposerSignature,
    );
    const wrongRollupAttestation = new CheckpointAttestation(
      withContext(checkpointAttestation.payload, WRONG_ROLLUP_CONTEXT),
      checkpointAttestation.signature,
      checkpointAttestation.proposerSignature,
    );
    expect(wrongChainAttestation.getSender()).not.toEqual(attesterSigner.address);
    expect(wrongRollupAttestation.getSender()).not.toEqual(attesterSigner.address);
    expect(wrongChainAttestation.getProposer()).not.toEqual(proposerSigner.address);
    expect(wrongRollupAttestation.getProposer()).not.toEqual(proposerSigner.address);

    expect(recoverCoordinationSigner(attestationsAndSigners, attestationsAndSignersSignature)).toEqual(
      attestationsAndSignersSigner.address,
    );
    expect(
      recoverCoordinationSigner(
        withContext(attestationsAndSigners, WRONG_CHAIN_CONTEXT),
        attestationsAndSignersSignature,
      ),
    ).not.toEqual(attestationsAndSignersSigner.address);
    expect(
      recoverCoordinationSigner(
        withContext(attestationsAndSigners, WRONG_ROLLUP_CONTEXT),
        attestationsAndSignersSignature,
      ),
    ).not.toEqual(attestationsAndSignersSigner.address);
  });
});
