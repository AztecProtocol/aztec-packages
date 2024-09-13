import { makeHeader } from '@aztec/circuits.js/testing';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { TxHash } from '../tx/tx_hash.js';
import { BlockAttestation } from './block_attestation.js';
import { BlockProposal } from './block_proposal.js';
import { getHashedSignaturePayload } from './block_utils.js';

export const makeBlockProposal = (signer?: Secp256k1Signer): BlockProposal => {
  signer = signer || randomSigner();

  const blockHeader = makeHeader(1);
  const archive = Fr.random();
  const txs = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());
  const hash = getHashedSignaturePayload(archive, txs);
  const signature = signer.sign(hash);

  return new BlockProposal(blockHeader, archive, txs, signature);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = (signer?: Secp256k1Signer): BlockAttestation => {
  signer = signer || randomSigner();

  const blockHeader = makeHeader(1);
  const archive = Fr.random();
  const txs = [0, 1, 2, 3, 4, 5].map(() => TxHash.random());
  const hash = getHashedSignaturePayload(archive, txs);
  const signature = signer.sign(hash);

  return new BlockAttestation(blockHeader, archive, txs, signature);
};

export const randomSigner = (): Secp256k1Signer => {
  const privateKey = Buffer32.random();
  return new Secp256k1Signer(privateKey);
};
