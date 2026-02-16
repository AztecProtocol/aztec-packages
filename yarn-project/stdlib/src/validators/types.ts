import type { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';

export type ValidatorStatusType = 'proposer' | 'attestation';

export type ValidatorStatusInSlot =
  | 'checkpoint-mined'
  | 'checkpoint-proposed'
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
  allTimeProvenPerformance: { missed: number; total: number; epoch: EpochNumber }[];
  lastProcessedSlot?: SlotNumber;
  initialSlot?: SlotNumber;
  slotWindow: number;
};
