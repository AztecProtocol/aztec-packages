import { type BlockHeader } from '@aztec/circuits.js';
import { makeHeader } from '@aztec/circuits.js/testing';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { TxHash } from '../tx/tx_hash.js';
import { BlockAttestation } from './block_attestation.js';
import { BlockProposal } from './block_proposal.js';
import { ConsensusPayload } from './consensus_payload.js';
import { SignatureDomainSeperator, getHashedSignaturePayloadEthSignedMessage } from './signature_utils.js';

export interface MakeConsensusPayloadOptions {
  signer?: Secp256k1Signer;
  header?: BlockHeader;
  archive?: Fr;
  txHashes?: TxHash[];
}

const makeAndSignConsensusPayload = (
  domainSeperator: SignatureDomainSeperator,
  options?: MakeConsensusPayloadOptions,
) => {
  const {
    signer = Secp256k1Signer.random(),
    header = makeHeader(1),
    archive = Fr.random(),
    txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random()),
  } = options ?? {};

  const payload = ConsensusPayload.fromFields({
    header,
    archive,
    txHashes,
  });

  const hash = getHashedSignaturePayloadEthSignedMessage(payload, domainSeperator);
  const signature = signer.sign(hash);

  return { payload, signature };
};

export const makeBlockProposal = (options?: MakeConsensusPayloadOptions): BlockProposal => {
  const { payload, signature } = makeAndSignConsensusPayload(SignatureDomainSeperator.blockProposal, options);
  return new BlockProposal(payload, signature);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = (options?: MakeConsensusPayloadOptions): BlockAttestation => {
  const { payload, signature } = makeAndSignConsensusPayload(SignatureDomainSeperator.blockAttestation, options);
  return new BlockAttestation(payload, signature);
};
