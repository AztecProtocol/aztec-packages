import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';

import EventEmitter from 'node:events';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs, type Watcher, type WatcherEmitter } from '../watcher.js';

export class DummyWatcher extends (EventEmitter as new () => WatcherEmitter) implements Watcher {
  public updateConfig(_config: Partial<SlasherConfig>) {}

  public start() {
    return Promise.resolve();
  }

  public stop() {
    return Promise.resolve();
  }

  public triggerSlash(args: WantToSlashArgs[]) {
    this.emit(WANT_TO_SLASH_EVENT, args);
  }
}
