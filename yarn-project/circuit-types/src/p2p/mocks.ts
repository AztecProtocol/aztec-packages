import { type BlockHeader } from '@aztec/circuits.js';
import { makeHeader } from '@aztec/circuits.js/testing';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import { BlockAttestation } from './block_attestation.js';
import { BlockProposal } from './block_proposal.js';
import { BlockProposalPayload, ConsensusPayload } from './consensus_payload.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from './signature_utils.js';

export interface MakeConsensusPayloadOptions {
  signer?: Secp256k1Signer;
  header?: BlockHeader;
  archive?: Fr;
  txHashes?: TxHash[];
}

const makeAndSignConsensusPayload = async (
  domainSeparator: SignatureDomainSeparator,
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

  const hash = await getHashedSignaturePayloadEthSignedMessage(payload, domainSeparator);
  const signature = signer.sign(hash);

  return { payload, signature };
};

const makeAndSignBlockProposalPayload = async (
  domainSeparator: SignatureDomainSeparator,
  options?: MakeConsensusPayloadOptions,
) => {
  const txs = await Promise.all(Array.from({ length: 6 }, () => Tx.random()));
  const { signer = Secp256k1Signer.random(), header = makeHeader(1), archive = Fr.random() } = options ?? {};

  const payload = BlockProposalPayload.fromFields({
    header,
    archive,
    txs,
  });

  const hash = await getHashedSignaturePayloadEthSignedMessage(payload, domainSeparator);
  const signature = signer.sign(hash);

  return { payload, signature };
};

export const makeBlockProposal = async (options?: MakeConsensusPayloadOptions): Promise<BlockProposal> => {
  const { payload, signature } = await makeAndSignBlockProposalPayload(SignatureDomainSeparator.blockProposal, options);
  return new BlockProposal(payload, signature);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = async (options?: MakeConsensusPayloadOptions): Promise<BlockAttestation> => {
  const { payload, signature } = await makeAndSignConsensusPayload(SignatureDomainSeparator.blockAttestation, options);
  return new BlockAttestation(payload, signature);
};
