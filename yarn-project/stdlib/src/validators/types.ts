import type { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';

export type ValidatorStatusType = 'proposer' | 'attestation';

/**
 * Per-slot status for a validator.
 *
 * Proposer statuses (six-case taxonomy):
 * - `blocks-missed`           — no block proposals seen for the slot (case 1).
 * - `checkpoint-missed`       — block proposals seen but no checkpoint proposal (case 2).
 * - `checkpoint-unvalidated`  — checkpoint proposal seen but local re-execution couldn't
 *                               validate (missing txs, timeouts, etc.) (case 3).
 * - `checkpoint-invalid`      — checkpoint proposal re-executed and rejected as invalid (case 4).
 * - `checkpoint-valid`        — checkpoint proposal re-executed locally as valid (case 5).
 * - `checkpoint-mined`        — checkpoint published on L1 (case 6).
 *
 * Attestor statuses:
 * - `attestation-sent`        — attestation observed on P2P or in the published checkpoint.
 * - `attestation-missed`      — committee member did not attest to a checkpoint proposal that
 *                               was observed locally or published on L1.
 */
export type ValidatorStatusInSlot =
  | 'checkpoint-mined'
  | 'checkpoint-valid'
  | 'checkpoint-invalid'
  | 'checkpoint-unvalidated'
  | 'checkpoint-missed'
  | 'blocks-missed'
  | 'attestation-sent'
  | 'attestation-missed';

export type ValidatorStatusHistory = { slot: SlotNumber; status: ValidatorStatusInSlot }[];

export type ValidatorMissedStats = {
  currentStreak: number;
  rate?: number;
  count: number;
  total: number;
};

export type ValidatorStats = {
  address: EthAddress;
  lastProposal?: { timestamp: bigint; slot: SlotNumber; date: string };
  lastAttestation?: { timestamp: bigint; slot: SlotNumber; date: string };
  totalSlots: number;
  missedProposals: ValidatorMissedStats;
  missedAttestations: ValidatorMissedStats;
  history: ValidatorStatusHistory;
};

export type ValidatorsStats = {
  stats: Record<string, ValidatorStats>;
  lastProcessedSlot?: SlotNumber;
  initialSlot?: SlotNumber;
  slotWindow: number;
};

export type ValidatorsEpochPerformance = Record<`0x${string}`, { missed: number; total: number }>;

export type SingleValidatorStats = {
  validator: ValidatorStats;
  allTimeEpochPerformance: { missed: number; total: number; epoch: EpochNumber }[];
  lastProcessedSlot?: SlotNumber;
  initialSlot?: SlotNumber;
  slotWindow: number;
};
