import { makeHeader } from '@aztec/circuits.js/testing';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { TxHash } from '../tx/tx_hash.js';
import { BlockAttestation } from './block_attestation.js';
import { BlockProposal } from './block_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';
import { getHashedSignaturePayloadEthSignedMessage } from './signature_utils.js';

const makeAndSignConsensusPayload = (signer = Secp256k1Signer.random()) => {
  const payload = ConsensusPayload.fromFields({
    header: makeHeader(1),
    archive: Fr.random(),
    txHashes: [0, 1, 2, 3, 4, 5].map(() => TxHash.random()),
  });

  const hash = getHashedSignaturePayloadEthSignedMessage(payload);
  const signature = signer.sign(hash);

  return { payload, signature };
};

export const makeBlockProposal = (signer = Secp256k1Signer.random()): BlockProposal => {
  const { payload, signature } = makeAndSignConsensusPayload(signer);
  return new BlockProposal(payload, signature);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = (signer?: Secp256k1Signer): BlockAttestation => {
  const { payload, signature } = makeAndSignConsensusPayload(signer);
  return new BlockAttestation(payload, signature);
};
