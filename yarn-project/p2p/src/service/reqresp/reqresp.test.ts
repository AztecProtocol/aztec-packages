import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { tcp } from "@libp2p/tcp";
import {bootstrap} from "@libp2p/bootstrap";
import { Libp2pOptions, createLibp2p } from "libp2p";
import { ReqResp } from "./reqresp.js";
import { sleep } from "@aztec/foundation/sleep";


async function createLibp2pNode (boostrapAddrs: string[] = []) {
    const options: Libp2pOptions = {
        addresses: {
            listen: [
                '/ip4/0.0.0.0/tcp/0'
            ]
        },
        connectionEncryption: [
            noise()
        ],
        streamMuxers: [
            yamux()
        ],
        transports: [
            tcp()
        ],
    }

    if (boostrapAddrs.length > 0) {
        options.peerDiscovery = [
            bootstrap({
                list: boostrapAddrs
            })
        ]
    }

    return await createLibp2p(options);
}

// The Req Resp protocol should allow nodes to dial specific peers 
// and ask for specific data that they missed via the traditional gossip protocol.
describe('ReqResp', () => {

    it("Should perform a ping request", async () => {
        // Create two nodes
        // They need to discover each other
        const p2pNode1 = await createLibp2pNode();
        const p2pNode2 = await createLibp2pNode();

        const pinger = new ReqResp(p2pNode1);
        const ponger = new ReqResp(p2pNode2);

        pinger.start();
        ponger.start();

        // connect the nodes
        const p2pNode2Addr =  p2pNode2.getMultiaddrs()[0];
        await p2pNode1.dial(p2pNode2Addr);

        await sleep(500);

        const res = await pinger.performPing(p2pNode2.peerId);

        await sleep(500);
        expect(res).toEqual("pong");

        await ponger.stop();
        await pinger.stop();
        await p2pNode1.stop();
        await p2pNode2.stop();

        await sleep(2000);
    })
});