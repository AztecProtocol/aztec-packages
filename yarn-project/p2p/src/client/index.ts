import { type L2BlockSource, TxHash } from '@aztec/circuit-types';
import { type AztecKVStore } from '@aztec/kv-store';

import { type AttestationPool } from '../attestation_pool/attestation_pool.js';
import { P2PClient } from '../client/p2p_client.js';
import { type P2PConfig } from '../config.js';
import { DiscV5Service } from '../service/discV5_service.js';
import { DummyP2PService } from '../service/dummy_service.js';
import { LibP2PService, createLibP2PPeerId } from '../service/index.js';
import { pingHandler, statusHandler } from '../service/reqresp/handlers.js';
import { PING_PROTOCOL, STATUS_PROTOCOL, TX_REQ_PROTOCOL } from '../service/reqresp/interface.js';
import { type TxPool } from '../tx_pool/index.js';
import { getPublicIp, splitAddressPort } from '../util.js';

export * from './p2p_client.js';

export const createP2PClient = async (
  config: P2PConfig,
  store: AztecKVStore,
  txPool: TxPool,
  attestationsPool: AttestationPool,
  l2BlockSource: L2BlockSource,
) => {
  let p2pService;

  if (config.p2pEnabled) {
    // If announceTcpAddress or announceUdpAddress are not provided, query for public IP if config allows

    // TODO: move create libp2p2 client INTO the p2p client constructor?????
    // WHat is the advantage to defining here and passing it in?
    const {
      tcpAnnounceAddress: configTcpAnnounceAddress,
      udpAnnounceAddress: configUdpAnnounceAddress,
      queryForIp,
    } = config;

    // create variable for re-use if needed
    let publicIp;

    // check if no announce IP was provided
    const splitTcpAnnounceAddress = splitAddressPort(configTcpAnnounceAddress || '', true);
    if (splitTcpAnnounceAddress.length == 2 && splitTcpAnnounceAddress[0] === '') {
      if (queryForIp) {
        publicIp = await getPublicIp();
        const tcpAnnounceAddress = `${publicIp}:${splitTcpAnnounceAddress[1]}`;
        config.tcpAnnounceAddress = tcpAnnounceAddress;
      } else {
        throw new Error(
          `Invalid announceTcpAddress provided: ${configTcpAnnounceAddress}. Expected format: <addr>:<port>`,
        );
      }
    }

    const splitUdpAnnounceAddress = splitAddressPort(configUdpAnnounceAddress || '', true);
    if (splitUdpAnnounceAddress.length == 2 && splitUdpAnnounceAddress[0] === '') {
      // If announceUdpAddress is not provided, use announceTcpAddress
      if (!queryForIp && config.tcpAnnounceAddress) {
        config.udpAnnounceAddress = config.tcpAnnounceAddress;
      } else if (queryForIp) {
        const udpPublicIp = publicIp || (await getPublicIp());
        const udpAnnounceAddress = `${udpPublicIp}:${splitUdpAnnounceAddress[1]}`;
        config.udpAnnounceAddress = udpAnnounceAddress;
      }
    }

    // Create peer discovery service
    const peerId = await createLibP2PPeerId(config.peerIdPrivateKey);
    const discoveryService = new DiscV5Service(peerId, config);

    // TODO: this must go somewhere else - AHHHHHHHHHHH - this whole thing needs a layercaking
    const txHandler = (msg: Buffer): Promise<Uint8Array> => {
      const txHash = TxHash.fromBuffer(msg);
      const foundTx = txPool.getTxByHash(txHash);
      const asUint8Array = Uint8Array.from(foundTx ? foundTx.toBuffer() : Buffer.alloc(0));
      return Promise.resolve(asUint8Array);
    };

    const requestResponseHandlers = {
      [PING_PROTOCOL]: pingHandler,
      [STATUS_PROTOCOL]: statusHandler,
      [TX_REQ_PROTOCOL]: txHandler,
    };

    // TODO: pass the reqresp handlers in here - using callbacks for the proof of concept
    p2pService = await LibP2PService.new(
      config,
      discoveryService,
      peerId,
      txPool,
      attestationsPool,
      store,
      requestResponseHandlers,
    );
  } else {
    p2pService = new DummyP2PService();
  }
  return new P2PClient(store, l2BlockSource, txPool, attestationsPool, p2pService, config.keepProvenTxsInPoolFor);
};
