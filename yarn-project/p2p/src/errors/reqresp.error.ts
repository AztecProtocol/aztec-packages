import { type ReqRespSubProtocol, TX_REQ_PROTOCOL } from '../service/reqresp/interface.js';

export class ReqRespError extends Error {
  constructor(protocol: ReqRespSubProtocol, message: string) {
    super(message);
  }
}

// TODO(md): think about what these errors should ideally be
export class TxHandlerReqRespError extends ReqRespError {
  constructor() {
    super(TX_REQ_PROTOCOL, 'Could not perform tx handler request response');
  }
}
