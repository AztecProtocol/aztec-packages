import { WALLET_ANNOUNCE_EVENT_TYPE, WALLET_REQUEST_EVENT_TYPE, type WalletWithMetadata } from '../common/types.js';

export class WalletDiscoveryService extends EventTarget {
  static instance: WalletDiscoveryService;
  #wallets: WalletWithMetadata[] = [];

  private constructor() {
    super();
    if (typeof window !== 'undefined') {
      window.addEventListener(WALLET_ANNOUNCE_EVENT_TYPE, (event: any) => {
        const walletEvent = event as CustomEvent<WalletWithMetadata>;
        WalletDiscoveryService.instance.#wallets.push(walletEvent.detail);
        WalletDiscoveryService.instance.dispatchEvent(new CustomEvent('wallet', { detail: walletEvent }));
      });
    }
    window.dispatchEvent(new CustomEvent(WALLET_REQUEST_EVENT_TYPE));
  }

  static getInstance() {
    if (!WalletDiscoveryService.instance) {
      WalletDiscoveryService.instance = new WalletDiscoveryService();
    }
    return WalletDiscoveryService.instance;
  }

  get wallets(): WalletWithMetadata[] {
    return this.#wallets;
  }
}
