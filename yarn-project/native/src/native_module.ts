import bindings from 'bindings';

import { MessageBody, MessageReceiver, MsgpackChannel } from './msgpack_channel.js';

interface NativeClassCtor {
  new (...args: unknown[]): MessageReceiver;
}

enum NativeClass {
  WorldState = 'WorldState',
  LMDBStore = 'LMDBStore',
}

const nativeModule: Record<string, NativeClassCtor> = bindings('nodejs_module');

export const NativeWorldState: NativeClassCtor = nativeModule.WorldState;
export const NativeLMDBStore: NativeClassCtor = nativeModule.LMDBStore;

function instantiate<M extends number = number, Req extends MessageBody<M> = any, Resp extends MessageBody<M> = any>(
  klassName: string,
  ...args: unknown[]
): MsgpackChannel<M, Req, Resp> {
  const inst = new nativeModule[klassName](...args);
  return new MsgpackChannel(inst);
}

const instantiateWorldState = instantiate.bind(null, 'WorldState');

function instantiateStore<
  M extends number = number,
  Req extends MessageBody<M> = any,
  Resp extends MessageBody<M> = any,
>(...args: unknown[]): MsgpackChannel<M, Req, Resp> {
  const inst = new nativeModule['Store'](...args);
  return new MsgpackChannel(inst);
}
