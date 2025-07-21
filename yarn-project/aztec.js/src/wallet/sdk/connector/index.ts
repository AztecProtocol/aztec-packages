import type { Wallet } from '@aztec/aztec.js';

import { WALLET_ANNOUNCE_EVENT_TYPE, WALLET_REQUEST_EVENT_TYPE } from '../common/types.js';

export class WalletConnector {
  private static instance: WalletConnector;

  private constructor(
    private uuid: string,
    private name: string,
    private icon: string,
    private rdns: string,
    private wallet: Wallet,
  ) {}

  static getInstance(uuid: string, name: string, icon: string, rdns: string, wallet: Wallet): WalletConnector {
    if (!this.instance) {
      this.instance = new WalletConnector(uuid, name, icon, rdns, wallet);
    }
    return this.instance;
  }

  announce(): void {
    if (typeof window !== 'undefined') {
      const announceEvent = new CustomEvent(WALLET_ANNOUNCE_EVENT_TYPE, {
        detail: {
          info: {
            uuid: this.uuid,
            name: this.name,
            icon: this.icon,
            rdns: this.rdns,
          },
          provider: this.wallet,
        },
      });

      window.addEventListener(WALLET_REQUEST_EVENT_TYPE, () => {
        window.dispatchEvent(announceEvent);
      });
      window.dispatchEvent(announceEvent);
    }
  }
}
