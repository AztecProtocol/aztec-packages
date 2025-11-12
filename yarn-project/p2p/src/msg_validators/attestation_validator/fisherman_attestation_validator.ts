import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { type BlockAttestation, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, Metrics, type TelemetryClient, ValueType } from '@aztec/telemetry-client';

import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import { AttestationValidator } from './attestation_validator.js';

/**
 * FishermanAttestationValidator extends the base AttestationValidator to add
 * additional validation for fisherman nodes: verifying that attestations sign
 * the same payload as the original proposal.
 * Invalid attestations are rejected (not propagated), but peer penalization is
 * handled by LibP2PService based on the fishermanMode config to ensure a better
 * view of the network.
 */
export class FishermanAttestationValidator extends AttestationValidator {
  private invalidAttestationCounter;

  constructor(
    epochCache: EpochCacheInterface,
    private attestationPool: AttestationPool,
    telemetryClient: TelemetryClient,
  ) {
    super(epochCache);
    this.logger = this.logger.createChild('[FISHERMAN]');

    const meter = telemetryClient.getMeter('FishermanAttestationValidator');
    this.invalidAttestationCounter = meter.createUpDownCounter(Metrics.VALIDATOR_INVALID_ATTESTATION_RECEIVED_COUNT, {
      description: 'The number of invalid attestations received',
      valueType: ValueType.INT,
    });
  }

  override async validate(message: BlockAttestation): Promise<PeerErrorSeverity | undefined> {
    // First run the standard validation
    const baseValidationResult = await super.validate(message);
    if (baseValidationResult !== undefined) {
      // Track base validation failures (invalid signature, wrong committee, etc.)
      this.invalidAttestationCounter.add(1, {
        [Attributes.ERROR_TYPE]: 'base_validation_failed',
      });
      return baseValidationResult;
    }

    // fisherman validation: verify attestation payload matches proposal payload
    const slotNumberBigInt = message.payload.header.slotNumber.toBigInt();
    const attester = message.getSender();
    const proposer = message.getProposer();

    if (!attester || !proposer) {
      return undefined;
    }

    const proposalId = message.archive.toString();
    const proposal = await this.attestationPool.getBlockProposal(proposalId);

    if (proposal) {
      // Compare the attestation payload with the proposal payload
      if (!message.payload.equals(proposal.payload)) {
        this.logger.error(
          `Attestation payload mismatch for slot ${slotNumberBigInt}! ` +
            `Attester ${attester.toString()} signed different data than the proposal.`,
          {
            slot: slotNumberBigInt.toString(),
            attester: attester.toString(),
            proposer: proposer.toString(),
            proposalArchive: proposal.archive.toString(),
            attestationArchive: message.archive.toString(),
            proposalHeader: proposal.payload.header.hash().toString(),
            attestationHeader: message.payload.header.hash().toString(),
          },
        );

        // Track invalid attestation metric
        this.invalidAttestationCounter.add(1, {
          [Attributes.ERROR_TYPE]: 'payload_mismatch',
        });

        // Return error to reject the message, but LibP2PService won't penalize in fisherman mode
        return PeerErrorSeverity.LowToleranceError;
      }
    } else {
      // We might receive attestations before proposals in some cases
      this.logger.debug(
        `Received attestation for slot ${slotNumberBigInt} but proposal not found yet. ` + `Proposal ID: ${proposalId}`,
      );
    }

    return undefined;
  }
}
