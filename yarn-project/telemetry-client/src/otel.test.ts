import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import { OpenTelemetryClient } from './otel.js';

describe('OpenTelemetryClient', () => {
  const makeProvider = () => ({
    forceFlush: jest.fn(() => Promise.resolve()),
    shutdown: jest.fn(() => Promise.resolve()),
  });

  const makeClient = (meterProvider: any, loggerProvider: any) =>
    // The constructor is protected; the prover-node/aztec-node share a single client, which is the case we exercise.
    new (OpenTelemetryClient as any)(
      { attributes: {} },
      meterProvider,
      { getTracer: () => ({}) },
      loggerProvider,
      undefined,
      createLogger('test'),
    ) as OpenTelemetryClient;

  it('only shuts the providers down once when stop is called multiple times', async () => {
    const meterProvider = makeProvider();
    const loggerProvider = makeProvider();
    const client = makeClient(meterProvider, loggerProvider);

    await Promise.all([client.stop(), client.stop()]);
    await client.stop();

    expect(meterProvider.shutdown).toHaveBeenCalledTimes(1);
    expect(loggerProvider.shutdown).toHaveBeenCalledTimes(1);
  });

  it('does not force flush after the client has been stopped', async () => {
    const meterProvider = makeProvider();
    const loggerProvider = makeProvider();
    const client = makeClient(meterProvider, loggerProvider);

    await client.stop();
    meterProvider.forceFlush.mockClear();
    loggerProvider.forceFlush.mockClear();

    await client.flush();

    expect(meterProvider.forceFlush).not.toHaveBeenCalled();
    expect(loggerProvider.forceFlush).not.toHaveBeenCalled();
  });
});
