// TODO: credit lodestar impl for inspiration

import {pipe} from 'it-pipe';
import { Logger, createDebugLogger } from "@aztec/foundation/log";
import { Libp2p } from "libp2p";
import {Connection, IncomingStreamData, PeerId, Stream, StreamHandler} from "@libp2p/interface";
// I think that I need an underlying up and req resp handler that will have the 
// underlying logic to add listeners for certain protocol messages

// Whenever i receive a message, we need to switch the handler based on who has called it

const PING_PROTOCOL = "/aztec/ping/0.1.0";

// Start with just the ping
export class ReqResp {
    protected readonly logger: Logger;


    // TOOD: rate limiters etc
    private abortController: AbortController = new AbortController();

    constructor(
        protected readonly libp2p: Libp2p,
    ) {
        this.logger = createDebugLogger('aztec:p2p:reqresp');
    }

    async start() {
        await this.registerPing();
    }

    async stop() {
        await this.libp2p.stop();
        this.abortController.abort();
    }

    async registerPing(){ // todo types
        return this.libp2p.handle(PING_PROTOCOL, handlePing.bind(this))
    }

    async performPing(peerId: PeerId) {
        const stream = await this.libp2p.dialProtocol(peerId, PING_PROTOCOL);

        const result = await pipe(
            [Buffer.from("ping")],
            stream,
            async function(source) {
                for await (const chunk of source) {
                    return Buffer.from(chunk.subarray()).toString();
                }
            }
        );
        return result;
    }
}

async function handlePing(streamData: IncomingStreamData) {
    // ADD TIMEOUTS
    
    const { stream, connection } = streamData;
    try {
        await pipe(
            // TODO: types
            stream,
            async function* (source: any) {
              for await (const chunk of source) {
                const msg = Buffer.from(chunk.subarray()).toString();
                if (msg === 'ping') {
                  yield Uint8Array.from(Buffer.from('pong'));
                }
              }
            },
            stream
          );

    } catch (e: any){
        console.log(e)
    }
    finally {
        await stream.close();
    }
}