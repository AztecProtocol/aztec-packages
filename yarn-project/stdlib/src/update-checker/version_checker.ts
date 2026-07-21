import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';

import { EventEmitter } from 'node:events';

export type EventMap = {
  newVersion: [{ name: string; currentVersion: string; latestVersion: string }];
};

export type VersionCheck = {
  name: string;
  currentVersion: string;
  getLatestVersion: () => Promise<string | undefined>;
};

export class VersionChecker extends EventEmitter<EventMap> {
  private runningPromise: RunningPromise;
  constructor(
    private checks: Array<VersionCheck>,
    intervalCheckMs = 60_000,
    private logger = createLogger('version_checker'),
  ) {
    super();
    this.runningPromise = new RunningPromise(this.run, logger, intervalCheckMs);
  }

  public start(): void {
    if (this.runningPromise.isRunning()) {
      this.logger.warn('VersionChecker is already running');
      return;
    }

    this.runningPromise.start();
    this.logger.info('Version check started');
  }

  public trigger(): Promise<void> {
    return this.runningPromise.trigger();
  }

  public async stop(): Promise<void> {
    if (!this.runningPromise.isRunning()) {
      this.logger.warn('VersionChecker is not running');
      return;
    }

    await this.runningPromise.stop();
    this.logger.info('Version checker stopped');
  }

  private run = async () => {
    await Promise.allSettled(this.checks.map(check => this.checkVersion(check)));
  };

  private async checkVersion({ name, currentVersion, getLatestVersion }: VersionCheck): Promise<void> {
    try {
      const latestVersion = await getLatestVersion();
      if (latestVersion && latestVersion !== currentVersion) {
        this.emit('newVersion', { name, latestVersion, currentVersion });
      }
    } catch (err) {
      this.logger.warn(`Error checking for new ${name} versions: ${err}`, { err });
    }
  }
}
