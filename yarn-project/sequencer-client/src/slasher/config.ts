import type { ConfigMappingsType } from '@aztec/foundation/config';
import { bigintConfigHelper, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

export interface SlasherConfig {
  // New configurations based on design doc
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSlots: number; // TTL for payloads, in L1 slots/blocks
  slashPruneCreate: boolean;
  slashPrunePenalty: bigint;
  slashPruneSignal: boolean;
  slashInactivityCreateTargetPercentage: number; // 0-100
  slashInactivityCreatePenalty: bigint;
  slashInactivitySignalTargetPercentage: number; // 0-100
  // Consider adding: slashInactivityCreateEnabled: boolean;
}

export const slasherConfigMappings: ConfigMappingsType<SlasherConfig> = {
  slashOverridePayload: {
    description: 'An Ethereum address for a slash payload to vote for unconditionally.',
    parseEnv: (val: string) => (val ? EthAddress.fromString(val) : undefined),
    defaultValue: undefined,
  },
  slashPayloadTtlSlots: {
    description: 'Time-to-live for slash payloads in L1 slots/blocks.',
    ...numberConfigHelper(0),
  },
  slashPruneCreate: {
    description: 'Enable creation of slash payloads for pruned epochs.',
    ...booleanConfigHelper(false),
  },
  slashPrunePenalty: {
    description: 'Penalty amount for slashing validators of a pruned epoch.',
    ...bigintConfigHelper(0n),
  },
  slashPruneSignal: {
    description: 'Enable voting for slash payloads for pruned epochs.',
    ...booleanConfigHelper(false),
  },
  slashInactivityCreateTargetPercentage: {
    description: 'Missed attestation percentage to trigger creation of inactivity slash payload (0-100).',
    ...numberConfigHelper(0),
  },
  slashInactivityCreatePenalty: {
    description: 'Penalty amount for slashing an inactive validator.',
    ...bigintConfigHelper(0n),
  },
  slashInactivitySignalTargetPercentage: {
    description: 'Missed attestation percentage to trigger voting for an inactivity slash payload (0-100).',
    ...numberConfigHelper(0),
  },
};
