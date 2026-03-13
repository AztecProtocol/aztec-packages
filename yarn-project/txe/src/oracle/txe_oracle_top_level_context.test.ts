import type { Logger } from '@aztec/foundation/log';
import type { ContractStore } from '@aztec/pxe/server';
import { enrichPublicSimulationError } from '@aztec/pxe/server';
import type { SimulationError } from '@aztec/stdlib/errors';

import { type MockProxy, mock } from 'jest-mock-extended';

// We test that the error-handling pattern used around enrichPublicSimulationError
// logs a warning instead of silently swallowing errors.
// This mirrors the catch blocks in privateCallNewFlow and publicCallNewFlow.

jest.mock('@aztec/pxe/server', () => {
  const actual = jest.requireActual('@aztec/pxe/server');
  return {
    ...actual,
    enrichPublicSimulationError: jest.fn(),
  };
});

const mockedEnrich = enrichPublicSimulationError as jest.MockedFunction<typeof enrichPublicSimulationError>;

describe('TXEOracleTopLevelContext enrichPublicSimulationError error handling', () => {
  let logger: MockProxy<Logger>;
  let contractStore: MockProxy<ContractStore>;
  let revertReason: MockProxy<SimulationError>;

  beforeEach(() => {
    logger = mock<Logger>();
    contractStore = mock<ContractStore>();
    revertReason = mock<SimulationError>();
    revertReason.getMessage.mockReturnValue('test revert');
    jest.clearAllMocks();
  });

  /** Replicates the error-handling pattern from privateCallNewFlow and publicCallNewFlow. */
  async function runEnrichWithErrorHandling() {
    try {
      await enrichPublicSimulationError(revertReason, contractStore, logger);
    } catch (err) {
      logger.warn('Failed to enrich public simulation error', { err });
    }
    // After the try/catch, the original revert is always thrown
    throw new Error(`Contract execution has reverted: ${revertReason.getMessage()}`);
  }

  it('logs a warning when enrichPublicSimulationError throws', async () => {
    const enrichError = new Error('Failed to resolve artifact');
    mockedEnrich.mockRejectedValue(enrichError);

    await expect(runEnrichWithErrorHandling()).rejects.toThrow('Contract execution has reverted: test revert');

    expect(logger.warn).toHaveBeenCalledWith('Failed to enrich public simulation error', { err: enrichError });
  });

  it('does not log a warning when enrichPublicSimulationError succeeds', async () => {
    mockedEnrich.mockResolvedValue(undefined);

    await expect(runEnrichWithErrorHandling()).rejects.toThrow('Contract execution has reverted: test revert');

    expect(logger.warn).not.toHaveBeenCalled();
  });

});
