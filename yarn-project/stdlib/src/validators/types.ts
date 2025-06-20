import type { EthAddress } from '@aztec/foundation/eth-address';

export type ValidatorStatusType = 'block' | 'attestation';

export type ValidatorStatusInSlot =
  | 'block-mined'
  | 'block-proposed'
  | 'block-missed'
  | 'attestation-sent'
  | 'attestation-missed';

export type ValidatorStatusHistory = { slot: bigint; status: ValidatorStatusInSlot }[];

export type ValidatorStats = {
  address: EthAddress;
  lastProposal?: { timestamp: bigint; slot: bigint; date: string };
  lastAttestation?: { timestamp: bigint; slot: bigint; date: string };
  totalSlots: number;
  missedProposals: {
    currentStreak: number;
    rate?: number;
    count: number;
  };
  missedAttestations: {
    currentStreak: number;
    rate?: number;
    count: number;
  };
  history: ValidatorStatusHistory;
};

export type ValidatorsStats = {
  stats: Record<string, ValidatorStats>;
  lastProcessedSlot?: bigint;
  initialSlot?: bigint;
  slotWindow: number;
};

export type ValidatorsEpochPerformance = Record<`0x${string}`, { missed: number; total: number }>;
