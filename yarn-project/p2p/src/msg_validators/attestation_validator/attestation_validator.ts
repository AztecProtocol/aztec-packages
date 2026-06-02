import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { type Logger, createLogger } from '@aztec/foundation/log';
import {
  type CheckpointAttestation,
  type CoordinationSignatureContext,
  type P2PValidator,
  PeerErrorSeverity,
  type ValidationResult,
  hasValidSignatureContext,
} from '@aztec/stdlib/p2p';

import { PipeliningWindow } from '../clock_tolerance.js';

export class CheckpointAttestationValidator implements P2PValidator<CheckpointAttestation> {
  protected epochCache: EpochCacheInterface;
  protected logger: Logger;
  private readonly pipeliningWindow: PipeliningWindow;
  protected readonly signatureContext: CoordinationSignatureContext;

  constructor(
    epochCache: EpochCacheInterface,
    opts: {
      blockDurationMs?: number;
      signatureContext: CoordinationSignatureContext;
    },
  ) {
    this.epochCache = epochCache;
    this.pipeliningWindow = new PipeliningWindow(epochCache, { blockDurationMs: opts.blockDurationMs });
    this.signatureContext = opts.signatureContext;
    this.logger = createLogger('p2p:checkpoint-attestation-validator');
  }

  async validate(message: CheckpointAttestation): Promise<ValidationResult> {
    const slotNumber = message.payload.header.slotNumber;

    try {
      // Cross-chain replay check: reject attestations that carry a foreign signing domain.
      if (!hasValidSignatureContext(message.payload, this.signatureContext)) {
        this.logger.warn(`Rejecting checkpoint attestation with foreign signature context for slot ${slotNumber}`, {
          chainId: message.payload.signatureContext.chainId,
          rollupAddress: message.payload.signatureContext.rollupAddress.toString(),
          expectedChainId: this.signatureContext.chainId,
          expectedRollupAddress: this.signatureContext.rollupAddress.toString(),
        });
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }

      // Use target slots since proposals target pipeline slots (slot + 1 when pipelining).
      const { targetSlot, nextSlot } = this.epochCache.getTargetAndNextSlot();

      // Accept attestations whose explicit per-slot receive window contains the current wall-clock time.
      // The window spans the build-frame start to the attestation deadline (target_slot_start + S - 2E),
      // so it covers the build slot, the target slot, and clock-disparity grace on both ends.
      if (
        slotNumber !== targetSlot &&
        slotNumber !== nextSlot &&
        !this.pipeliningWindow.acceptsAttestation(slotNumber)
      ) {
        this.logger.warn(
          `Checkpoint attestation slot ${slotNumber} is not current (${targetSlot}) or next (${nextSlot}) slot`,
        );
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }

      // Verify the signature is valid
      const attester = message.getSender();
      if (attester === undefined) {
        this.logger.warn(`Invalid signature in checkpoint attestation for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }

      // Verify the attester is in the committee for this slot
      if (!(await this.epochCache.isInCommittee(slotNumber, attester))) {
        this.logger.warn(`Attester ${attester.toString()} is not in committee for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }

      // Verify the proposer signature matches the expected proposer for the attestation's slot
      // We look up the proposer for the specific slot rather than using currentSlot/nextSlot
      // since timing differences could cause mismatches
      const proposer = message.getProposer();
      const expectedProposer = await this.epochCache.getProposerAttesterAddressInSlot(slotNumber);
      if (!expectedProposer) {
        this.logger.warn(`No proposer defined for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }
      if (!proposer) {
        this.logger.warn(`Invalid proposer signature in checkpoint attestation for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }
      if (!proposer.equals(expectedProposer)) {
        this.logger.warn(
          `Proposer signature mismatch in checkpoint attestation. ` +
            `Expected ${expectedProposer?.toString() ?? 'none'} but got ${proposer.toString()} for slot ${slotNumber}`,
        );
        return { result: 'reject', severity: PeerErrorSeverity.HighToleranceError };
      }

      return { result: 'accept' };
    } catch (e) {
      // People shouldn't be sending us attestations if the committee doesn't exist
      if (e instanceof NoCommitteeError) {
        this.logger.warn(`No committee exists for checkpoint attestation for slot ${slotNumber}`);
        return { result: 'reject', severity: PeerErrorSeverity.LowToleranceError };
      }
      throw e;
    }
  }
}
