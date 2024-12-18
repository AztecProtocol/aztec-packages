import { type ConfigMapping, numberConfigHelper } from '@aztec/foundation/config';

export const DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS = 2000;
export const DEFAULT_OVERALL_REQUEST_TIMEOUT_MS = 4000;

// For use in tests.
export const DEFAULT_P2P_REQRESP_CONFIG: P2PReqRespConfig = {
  overallRequestTimeoutMs: DEFAULT_OVERALL_REQUEST_TIMEOUT_MS,
  individualRequestTimeoutMs: DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS,
};

export interface P2PReqRespConfig {
  /**
   * The overall timeout for a request response operation.
   */
  overallRequestTimeoutMs: number;

  /**
   * The timeout for an individual request response peer interaction.
   */
  individualRequestTimeoutMs: number;
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
};
