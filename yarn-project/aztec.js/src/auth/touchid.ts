import { createDebugLogger } from '@aztec/foundation/log';
import { Core } from '@walletconnect/core';
import { SignClient } from '@walletconnect/sign-client';
import q from 'qrcode-terminal';

const logger = createDebugLogger('aztec:WalletConnectTouchIdAuthProvider');

export type TouchIdAuthResult = {
  clientDataJson: Buffer;
  authData: Buffer;
  signature: Buffer;
};

export class WalletConnectTouchIdAuthProvider {
  private signClient: any;
  private aztecChainId = +'671337';
  private chains = [`aztec:${this.aztecChainId}`];
  private session?: any;
  constructor() {}
  async init() {
    const core = new Core({
      logger: 'info',
      projectId: '46b15d4ac7df71221bbf8b7299b90b88', //process.env.WALLETCONNECT_PROJECT_ID,
    });

    const signClient = await SignClient.init({
      logger: 'info',
      core,
      metadata: {
        name: 'End to End Tests App',
        description: 'An example dapp',
        url: 'mainframe',
        icons: [],
      },
    });
    this.signClient = signClient;
    const { uri, approval, ...rest } = await signClient.connect({
      requiredNamespaces: {
        aztec: {
          methods: ['aztec_authenticateTx'],
          chains: this.chains,
          events: [],
        },
      },
      pairingTopic: this.session ? this.session.pairingTopic : undefined,
    });
    logger(rest);
    logger('Connect your wallet');
    const url = `http://localhost:8080/wc?uri=${uri!}`;
    logger(url);
    q.generate(url, { small: true });

    this.session = await approval();
  }

  async disconnect() {
    await this.signClient.engine.disconnect();
  }

  async authenticateTx(payloadHash: Buffer): Promise<TouchIdAuthResult> {
    const resp = await this.signClient.request({
      topic: this.session.topic,
      request: { method: 'aztec_authenticateTx', params: [payloadHash] },
      chainId: this.chains[0],
    });

    return Promise.resolve({
      clientDataJson: Buffer.from(resp.clientDataJson.data),
      authData: Buffer.from(resp.authData.data),
      signature: Buffer.from(resp.signature.data),
    });
  }
}
