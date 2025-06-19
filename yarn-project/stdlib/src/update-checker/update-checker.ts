import { RegistryContract, type ViemClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { fileURLToPath } from '@aztec/foundation/url';

import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { isDeepStrictEqual } from 'util';
import { z } from 'zod';

const updateConfigSchema = z.object({
  version: z.string().optional(),
  publicTelemetry: z.any().optional(),
  config: z.any().optional(),
});

export type EventMap = {
  newRollupVersion: [{ currentVersion: bigint; latestVersion: bigint }];
  newNodeVersion: [{ currentVersion: string; latestVersion: string }];
  updateNodeConfig: [object];
  updatePublicTelemetryConfig: [object];
};

type Config = {
  baseURL: URL;
  nodeVersion?: string;
  checkIntervalMs?: number;
  registryContractAddress: EthAddress;
  publicClient: ViemClient;
  fetch?: typeof fetch;
};

export class UpdateChecker extends EventEmitter<EventMap> {
  private runningPromise: RunningPromise;
  private lastPatchedConfig: object = {};
  private lastPatchedPublicTelemetryConfig: object = {};

  constructor(
    private updatesUrl: URL,
    private nodeVersion: string | undefined,
    private rollupVersion: bigint,
    private fetch: typeof globalThis.fetch,
    private getLatestRollupVersion: () => Promise<bigint>,
    private checkIntervalMs = 60_000, // every minute
    private log = createLogger('foundation:update-check'),
  ) {
    super();
    this.runningPromise = new RunningPromise(this.runChecks, this.log, this.checkIntervalMs);
  }

  public static async new(config: Config): Promise<UpdateChecker> {
    const registryContract = new RegistryContract(config.publicClient, config.registryContractAddress);
    const getLatestRollupVersion = () => registryContract.getRollupVersions().then(versions => versions.at(-1)!);

    return new UpdateChecker(
      config.baseURL,
      config.nodeVersion ?? getPackageVersion(),
      await getLatestRollupVersion(),
      config.fetch ?? fetch,
      getLatestRollupVersion,
      config.checkIntervalMs,
    );
  }

  public start(): void {
    if (this.runningPromise.isRunning()) {
      this.log.debug(`Can't start update checker again`);
      return;
    }

    this.log.info('Starting update checker', {
      nodeVersion: this.nodeVersion,
      rollupVersion: this.rollupVersion,
    });
    this.runningPromise.start();
  }

  public stop(): Promise<void> {
    if (!this.runningPromise.isRunning()) {
      this.log.debug(`Can't stop update checker because it is not running`);
      return Promise.resolve();
    }
    return this.runningPromise.stop();
  }

  public trigger(): Promise<void> {
    return this.runningPromise.trigger();
  }

  private runChecks = async (): Promise<void> => {
    await Promise.all([this.checkRollupVersion(), this.checkConfig()]);
  };

  private async checkRollupVersion(): Promise<void> {
    try {
      const canonicalRollupVersion = await this.getLatestRollupVersion();
      if (canonicalRollupVersion !== this.rollupVersion) {
        this.log.debug('New canonical rollup version', {
          currentVersion: this.rollupVersion,
          latestVersion: canonicalRollupVersion,
        });
        this.emit('newRollupVersion', { currentVersion: this.rollupVersion, latestVersion: canonicalRollupVersion });
      }
    } catch (err) {
      this.log.warn(`Failed to check if there is a new rollup`, err);
    }
  }

  private async checkConfig(): Promise<void> {
    try {
      const response = await this.fetch(this.updatesUrl);
      const body = await response.json();
      if (!response.ok) {
        this.log.warn(`Unexpected HTTP response checking for updates`, {
          status: response.status,
          body: await response.text(),
          url: this.updatesUrl,
        });
      }

      const { version, config, publicTelemetry } = updateConfigSchema.parse(body);

      if (this.nodeVersion && version && version !== this.nodeVersion) {
        this.log.debug('New node version', { currentVersion: this.nodeVersion, latestVersion: version });
        this.emit('newNodeVersion', { currentVersion: this.nodeVersion, latestVersion: version });
      }

      if (config && Object.keys(config).length > 0 && !isDeepStrictEqual(config, this.lastPatchedConfig)) {
        this.log.debug('New node config', { config });
        this.lastPatchedConfig = config;
        this.emit('updateNodeConfig', config);
      }

      if (
        publicTelemetry &&
        Object.keys(publicTelemetry).length > 0 &&
        !isDeepStrictEqual(publicTelemetry, this.lastPachedPublicTelemetryConfig)
      ) {
        this.log.debug('New metrics config', { config });
        this.lastPachedPublicTelemetryConfig = publicTelemetry;
        this.emit('updatePublicTelemetryConfig', publicTelemetry);
      }
    } catch (err) {
      this.log.warn(`Failed to check if there is an update`, err);
    }
  }
}

/**
 * Returns package version.
 */
export function getPackageVersion(): string | undefined {
  try {
    const releasePleaseManifestPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../.release-please-manifest.json',
    );
    const version = JSON.parse(readFileSync(releasePleaseManifestPath).toString())['.'];
    return version;
  } catch {
    return undefined;
  }
}
