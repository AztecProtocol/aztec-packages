import type { Wallet } from '@aztec/aztec.js';

import { WALLET_ANNOUNCE_EVENT_TYPE, WALLET_REQUEST_EVENT_TYPE } from '../common/types.js';

export class WalletConnector {
  static instance: WalletConnector;

  private constructor(
    private uuid: string,
    private name: string,
    private icon: string,
    private rdns: string,
    wallet: Wallet,
  ) {
    if (typeof window !== 'undefined') {
      const announceEvent = new CustomEvent(WALLET_ANNOUNCE_EVENT_TYPE, {
        detail: {
          info: {
            uuid: this.uuid,
            name: this.name,
            icon: this.icon,
            rdns: this.rdns,
          },
          provider: wallet,
        },
      });

      window.addEventListener(WALLET_REQUEST_EVENT_TYPE, () => {
        window.dispatchEvent(announceEvent);
      });
      window.dispatchEvent(announceEvent);
    }
  }
}
