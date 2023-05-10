import { P2PService } from './service.js';

export class DummyP2PService implements P2PService {
  public start() {
    return Promise.resolve();
  }

  public stop() {
    return Promise.resolve();
  }
}
