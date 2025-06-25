import { type ConfigMapping, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

export const DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS = 2000;
export const DEFAULT_OVERALL_REQUEST_TIMEOUT_MS = 4000;
export const DEFAULT_OPTIMISTIC_NEGOTIATION = false;

// For use in tests.
export const DEFAULT_P2P_REQRESP_CONFIG: P2PReqRespConfig = {
  overallRequestTimeoutMs: DEFAULT_OVERALL_REQUEST_TIMEOUT_MS,
  individualRequestTimeoutMs: DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS,
  p2pOptimisticNegotiation: DEFAULT_OPTIMISTIC_NEGOTIATION,
};

export interface P2PReqRespConfig {
  /** The overall timeout for a request response operation. */
  overallRequestTimeoutMs: number;

  /** The timeout for an individual request response peer interaction. */
  individualRequestTimeoutMs: number;

  /** Whether to use optimistic protocol negotiation when dialing to another peer (opposite of `negotiateFully`). */
  p2pOptimisticNegotiation: boolean;
}

export const p2pReqRespConfigMappings: Record<keyof P2PReqRespConfig, ConfigMapping> = {
  overallRequestTimeoutMs: {
    env: 'P2P_REQRESP_OVERALL_REQUEST_TIMEOUT_MS',
    description: 'The overall timeout for a request response operation.',
    ...numberConfigHelper(DEFAULT_OVERALL_REQUEST_TIMEOUT_MS),
  },
  individualRequestTimeoutMs: {
    env: 'P2P_REQRESP_INDIVIDUAL_REQUEST_TIMEOUT_MS',
    description: 'The timeout for an individual request response peer interaction.',
    ...numberConfigHelper(DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS),
  },
  p2pOptimisticNegotiation: {
    env: 'P2P_REQRESP_OPTIMISTIC_NEGOTIATION',
    description:
      'Whether to use optimistic protocol negotiation when dialing to another peer (opposite of `negotiateFully`).',
    ...booleanConfigHelper(DEFAULT_OPTIMISTIC_NEGOTIATION),
  },
};
