import type { EthAddress } from '@aztec/foundation/eth-address';

export type ValidatorStatusType = 'block' | 'attestation';

export type ValidatorStatusInSlot =
  | 'block-mined'
  | 'block-proposed'
  | 'block-missed'
  | 'attestation-sent'
  | 'attestation-missed';

export type ValidatorStatusHistory = { slot: bigint; status: ValidatorStatusInSlot }[];

export type ValidatorMissedStats = {
  currentStreak: number;
  rate?: number;
  count: number;
  total: number;
};

export type ValidatorStats = {
  address: EthAddress;
  lastProposal?: { timestamp: bigint; slot: bigint; date: string };
  lastAttestation?: { timestamp: bigint; slot: bigint; date: string };
  totalSlots: number;
  missedProposals: ValidatorMissedStats;
  missedAttestations: ValidatorMissedStats;
  history: ValidatorStatusHistory;
};

export type ValidatorsStats = {
  stats: Record<string, ValidatorStats>;
  lastProcessedSlot?: bigint;
  initialSlot?: bigint;
  slotWindow: number;
};

export type ValidatorsEpochPerformance = Record<`0x${string}`, { missed: number; total: number }>;

export type SingleValidatorStats = {
  validator: ValidatorStats;
  allTimeProvenPerformance: { missed: number; total: number; epoch: bigint }[];
  lastProcessedSlot?: bigint;
  initialSlot?: bigint;
  slotWindow: number;
};
