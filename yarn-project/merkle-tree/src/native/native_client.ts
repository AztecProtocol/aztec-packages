import { DebugLogger, createDebugLogger } from "@aztec/foundation/log";
import { RunningPromise, promiseWithResolvers } from "@aztec/foundation/promise";
import { decodeMultiStream, encode } from "@msgpack/msgpack";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { GetTreeInfoRequest, GetTreeInfoResponse, InsertLeavesRequest, InsertLeavesResponse, MsgHeader, MsgPackedHeader, MsgPackedType, StartTreeRequest, StartTreeResponse, SystemMsgTypes, WorldStateMsgTypes } from './message.js';
import { Fr } from "@aztec/circuits.js";

export type NativeWorldStateConfig = {
  worldStateBinaryPath: string;
}

type Request = {
  requestId: number;
  responseHandler: (responseData: object) => void;
}

export class NativeTreesClient {
  private msgId = 1;
  private requests = new Map<number, Request>();
  private terminateResolve?: (data: Buffer) => void;
  private runningPromise: RunningPromise;
  
  constructor(private childProcess: ChildProcessWithoutNullStreams, private logger: DebugLogger) {
    this.runningPromise = new RunningPromise(() => this.handleData(), 10);
    this.runningPromise.start();
    childProcess.stderr.on("data", (d) => this.logger.debug(`World State Out: ${d}`));
    childProcess.on("close", () => this.onRemoteClose());
  }
  public static init(config: NativeWorldStateConfig, logger = createDebugLogger('aztec:native_client')) {
    logger.debug(`Starting world state at: ${config.worldStateBinaryPath}`);
    const child = spawn(config.worldStateBinaryPath, [], { stdio: ['pipe', 'pipe', 'pipe']});
    return new NativeTreesClient(child, logger);
  }

  public async terminate() {
    const encoded = encode({header: new MsgHeader(this.msgId++, 0), msgType: SystemMsgTypes.TERMINATE, value: {}} satisfies MsgPackedHeader);
    const { promise, resolve } = promiseWithResolvers<object>();
    this.terminateResolve = resolve;
    this.childProcess.stdin.write(encoded);
    await promise;
    this.runningPromise.stop();
  }

  public async sendPing() {
    const { promise } = this.sendMessage(SystemMsgTypes.PING);
    await promise;
  }

  public async sendStartTree(name: string, depth: number, preFilledSize = 1) {
    const request: StartTreeRequest = {
      name,
      depth,
      preFilledSize,
    };
    const { promise } = this.sendMessage(WorldStateMsgTypes.START_TREE_REQUEST, request);
    const response = (await promise) as StartTreeResponse;
    return response;
  }

  public async getTreeInfo(name: string) {
    const request: GetTreeInfoRequest = {
      name,
    };
    const { promise } = this.sendMessage(WorldStateMsgTypes.GET_TREE_INFO_REQUEST, request);
    const response = (await promise) as GetTreeInfoResponse;
    return response;
  }

  public async insertLeaves(name: string, leaves: Fr[]) {
    const request: InsertLeavesRequest = {
      name,
      leaves: leaves.map(x => x.toBuffer()),
    };
    const { promise } = this.sendMessage(104, request);
    const response = (await promise) as InsertLeavesResponse;
    return response;
  }

  private onRemoteClose() {
    this.terminateResolve?.(Buffer.alloc(0));
  }

  private sendMessage<T>(msgType: number, msg?: T) {
    const msgId = this.msgId++;
    const header = new MsgHeader(msgId, 0);
    const encoded = msg ? encode({header, msgType, value: msg} satisfies MsgPackedType<T>) : encode({header, msgType, value: {}} satisfies MsgPackedHeader);
    const { promise, resolve } = promiseWithResolvers<object>();

    const request: Request = {
      requestId: msgId,
      responseHandler: resolve,
    }
    this.requests.set(msgId, request);
    this.childProcess.stdin.write(encoded);
    return { promise, resolve };
  }

  private async handleData() {
    for await (const item of decodeMultiStream(this.childProcess.stdout)) {
      const itemAsHeader: MsgPackedHeader = item as MsgPackedHeader;
      const request = this.requests.get(itemAsHeader.header.requestId);
      request?.responseHandler(itemAsHeader.value);
    }
  }
}
