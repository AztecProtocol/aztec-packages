import type { TestDateProvider } from '@aztec/foundation/timer';

import type { MessagePort } from 'worker_threads';

import type { DateOffsetMessage } from './remote_date_provider.js';

/**
 * Bridges the main-thread authoritative {@link TestDateProvider} to any number of worker-thread
 * {@link RemoteDateProvider}s by posting the current offset down each observer's {@link MessagePort}
 * whenever the provider's time is mutated.
 *
 * Installation is idempotent across observers; the first `addObserver` call wraps the provider's
 * mutators, subsequent calls just register the extra port. Each registered port receives an
 * initial offset message on registration so the worker's clock is never stale.
 */
export class DateProviderBridge {
  private readonly observers: MessagePort[] = [];
  private installed = false;

  constructor(private readonly provider: TestDateProvider) {}

  /** Registers a worker-side port that should receive offset updates. */
  public addObserver(port: MessagePort): void {
    this.installOnce();
    this.observers.push(port);
    this.send(port);
  }

  /** Removes a previously registered port. Safe to call on an unregistered port (no-op). */
  public removeObserver(port: MessagePort): void {
    const i = this.observers.indexOf(port);
    if (i >= 0) {
      this.observers.splice(i, 1);
    }
  }

  private send(port: MessagePort): void {
    const msg: DateOffsetMessage = { offset: this.provider.now() - Date.now() };
    port.postMessage(msg);
  }

  private broadcast(): void {
    for (const port of this.observers) {
      this.send(port);
    }
  }

  private installOnce(): void {
    if (this.installed) {
      return;
    }
    this.installed = true;

    const provider = this.provider;
    const origSetTime = provider.setTime.bind(provider);
    const origAdvance = provider.advanceTime.bind(provider);
    const origReset = provider.reset.bind(provider);

    provider.setTime = (timeMs: number) => {
      origSetTime(timeMs);
      this.broadcast();
    };
    provider.advanceTime = (seconds: number) => {
      origAdvance(seconds);
      this.broadcast();
    };
    provider.reset = () => {
      origReset();
      this.broadcast();
    };
  }
}
