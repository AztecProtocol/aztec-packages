import { createLogger } from '@aztec/foundation/log';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { Tx, type TxValidationResult, type TxValidator } from '@aztec/stdlib/tx';

export class TxProofValidator implements TxValidator<Tx> {
  #log = createLogger('p2p:tx_validator:private_proof');
  private static readonly PROOF_TIMEOUT_MS = 1000;

  constructor(private verifier: ClientProtocolCircuitVerifier) {}

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    try {
      const proofTimeout = new Promise<boolean>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Proof verification timed out after ${TxProofValidator.PROOF_TIMEOUT_MS}ms`)),
          TxProofValidator.PROOF_TIMEOUT_MS,
        );
      });

      // Consider the proof invalid if verification takes longer than 1s. Valid proofs take ~300ms to validate.
      const isValid = await Promise.race([this.verifier.verifyProof(tx), proofTimeout]);

      if (!isValid) {
        this.#log.warn(`Rejecting tx ${await Tx.getHash(tx)} for invalid proof`);
        return { result: 'invalid', reason: ['Invalid proof'] };
      }

      this.#log.trace(`Accepted ${await Tx.getHash(tx)} with valid proof`);
      return { result: 'valid' };
    } catch (error) {
      this.#log.warn(`Rejecting tx ${await Tx.getHash(tx)}: ${String(error)}`);
      return { result: 'invalid', reason: ['Invalid proof'] };
    }
  }
}
