// For now we work with an attestation pool that will store the
// attestations we need to send with a block
import { type BlockAttestation } from '@aztec/circuit-types';

export interface AttestationPool {
  addAttestations(attestations: BlockAttestation[]): Promise<void>;
  deleteAttestations(attestations: BlockAttestation[]): Promise<void>;
  deleteAttestationsForSlot(slot: bigint): Promise<void>;

  getAttestationsForSlot(slot: bigint): Promise<BlockAttestation[]>;
}
