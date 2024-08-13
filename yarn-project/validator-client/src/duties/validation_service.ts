import { BlockAttestation, BlockProposal, TxHash } from '@aztec/circuit-types';
import { Header } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { ValidatorKeyStore } from '../key_store/interface.js';

export class ValidationService {
  constructor(private keyStore: ValidatorKeyStore) {}

  // TODO: maybe include a signature type with the serialized values
  async attestToProposal(proposal: BlockProposal): Promise<BlockAttestation> {
    // TODO: check that the current validator is correct

    // TODO: more than just the header
    const buf = proposal.archive.toBuffer();
    const sig = await this.keyStore.sign(buf);
    return new BlockAttestation(proposal.header, proposal.archive, sig);
  }

  async attestToBlock(header: Header, archive: Fr, txs: TxHash[]): Promise<BlockProposal> {
    // Note: just signing the archive for now
    const archiveBuf = archive.toBuffer();
    const sig = await this.keyStore.sign(archiveBuf);

    return new BlockProposal(header, archive, txs, sig);
  }
}
