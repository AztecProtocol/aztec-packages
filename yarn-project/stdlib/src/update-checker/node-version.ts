import { RegistryContract, type ViemClient } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { EventEmitter } from 'stream';
import { z } from 'zod';

const updateConfigSchema = z.object({
  version: z.string(),
  config: z.any().optional(),
});

type EventMap = {
  newVersion: [{ currentVersion: string; latestVersion: string }];
  updateConfig: [object];
  newRollup: [{ currentRollup: EthAddress; latestRollup: EthAddress }];
};

type Config = {
  baseURL: URL;
  nodeVersion?: string;
  checkIntervalMs?: number;
  fetch?: typeof fetch;
};

export class NodeVersionChecker extends EventEmitter<EventMap> {
  private runningPromise: RunningPromise;

  constructor(
    private configBasePath: URL,
    private nodeVersion: string,
    private fetch: typeof globalThis.fetch = fetch,
    private checkIntervalMs = 60_000, // every minute
    private log = createLogger('foundation:update-check'),
  ) {
    super();
    this.runningPromise = new RunningPromise(this.runChecks, this.log, this.checkIntervalMs);
  }

  public static async new(config: Config): Promise<NodeVersionChecker> {
    return new NodeVersionChecker(
      config.baseURL,
      config.nodeVersion ?? getPackageVersion(),
      config.fetch,
      config.checkIntervalMs,
    );
  }

  public async start() {
    if (this.runningPromise.isRunning()) {
      this.log.debug(`Can't start update checker again`);
      return;
    }

    this.runningPromise.start();
  }

  public stop() {
    if (!this.runningPromise.isRunning()) {
      this.log.debug(`Can't stop update checker because it is not running`);
      return;
    }
    return this.runningPromise.stop();
  }

  public trigger() {
    return this.runningPromise.trigger();
  }

  private runChecks = async (): Promise<void> => {
    await this.checkConfig();
  };

  private async checkConfig(): Promise<void> {
    try {
      const response = await this.fetch(
        new URL(
          'aztec-' +
            this.registryContract.client.getChainId() +
            '-' +
            this.rollupAddressAtStart.toString() +
            '/index.json',
          this.configBasePath,
        ),
      );
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          // no-op
          return;
        }
        this.log.warn(`Unexpected HTTP response checking for updates`, {
          status: response.status,
          body: await response.text(),
        });
      }

      const { version, config } = updateConfigSchema.parse(body);

      if (version !== this.nodeVersion) {
        this.emit('newVersion', { currentVersion: this.nodeVersion, latestVersion: version });
      }

      if (config && Object.keys(config).length > 0) {
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
export function getPackageVersion() {
  try {
    const releasePleaseManifestPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../.release-please-manifest.json',
    );
    const version = JSON.parse(readFileSync(releasePleaseManifestPath).toString());
    const buildMeta = process.env.BUILD_METADATA;
    return buildMeta ? version['.'] + '-' + buildMeta : version['.'];
  } catch (err) {
    return '0.0.0';
  }
}
