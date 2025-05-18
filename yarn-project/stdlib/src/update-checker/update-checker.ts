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
  config: z.any().optional(),
});

export type EventMap = {
  newVersion: [{ currentVersion: string; latestVersion: string }];
  updateConfig: [object];
  newRollup: [{ currentRollup: EthAddress; latestRollup: EthAddress }];
};

type Config = {
  baseURL: URL;
  rollupVersion?: number | 'canonical';
  nodeVersion?: string;
  checkIntervalMs?: number;
  registryContractAddress: EthAddress;
  publicClient: ViemClient;
  fetch?: typeof fetch;
};

export class UpdateChecker extends EventEmitter<EventMap> {
  private runningPromise: RunningPromise;
  private lastPatchedConfig: object = {};

  constructor(
    private configBasePath: URL,
    private nodeVersion: string | undefined,
    private rollupVersion: number | 'canonical',
    private rollupAddressAtStart: EthAddress,
    private fetch: typeof globalThis.fetch,
    private getRollupAddress: (version: number | 'canonical') => Promise<EthAddress>,
    private checkIntervalMs = 60_000, // every minute
    private log = createLogger('foundation:update-check'),
  ) {
    super();
    this.runningPromise = new RunningPromise(this.runChecks, this.log, this.checkIntervalMs);
  }

  public static async new(config: Config): Promise<UpdateChecker> {
    const registryContract = new RegistryContract(config.publicClient, config.registryContractAddress);
    const rollupAddress = await registryContract.getRollupAddress(config.rollupVersion ?? 'canonical');

    return new UpdateChecker(
      config.baseURL,
      config.nodeVersion ?? getPackageVersion(),
      config.rollupVersion ?? 'canonical',
      rollupAddress,
      config.fetch ?? fetch,
      version => registryContract.getRollupAddress(version),
      config.checkIntervalMs,
    );
  }

  public start(): void {
    if (this.runningPromise.isRunning()) {
      this.log.debug(`Can't start update checker again`);
      return;
    }

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
      const canonicalRollup = await this.getRollupAddress(this.rollupVersion);
      if (!canonicalRollup.equals(this.rollupAddressAtStart)) {
        this.emit('newRollup', { currentRollup: this.rollupAddressAtStart, latestRollup: canonicalRollup });
      }
    } catch (err) {
      this.log.warn(`Failed to check if there is a new rollup`, err);
    }
  }

  private async checkConfig(): Promise<void> {
    try {
      const response = await this.fetch(
        new URL('aztec-' + this.rollupAddressAtStart.toString() + '/index.json', this.configBasePath),
      );
      const body = await response.json();
      if (!response.ok) {
        this.log.warn(`Unexpected HTTP response checking for updates`, {
          status: response.status,
          body: await response.text(),
        });
      }

      const { version, config } = updateConfigSchema.parse(body);

      if (this.nodeVersion !== undefined && version !== undefined && version !== this.nodeVersion) {
        this.emit('newVersion', { currentVersion: this.nodeVersion, latestVersion: version });
      }

      if (config && Object.keys(config).length > 0 && !isDeepStrictEqual(config, this.lastPatchedConfig)) {
        this.lastPatchedConfig = config;
        this.emit('updateConfig', config);
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
  } catch (err) {
    return undefined;
  }
}
