import { type JsonRpcDiagnosticHooks } from '@aztec/foundation/json-rpc/server';
import { Span, SpanStatusCode, TelemetryClient, Tracer } from '@aztec/telemetry-client';

import { IncomingHttpHeaders } from 'node:http';

export class JsonRpcInstrumentation implements JsonRpcDiagnosticHooks {
  private spans = new Map<string | number, Span>();
  private tracer: Tracer;

  constructor(telemetry: TelemetryClient) {
    this.tracer = telemetry.getTracer('JsonRpcServer');
  }

  onJsonRpcRequest(rpcId: number | string | null, rpcMethod: string, _headers: IncomingHttpHeaders): void {
    if (rpcId === null) {
      return;
    }

    const span = this.tracer.startSpan(rpcMethod);
    span.setAttribute('jsonrpc_id', rpcId);
    span.setAttribute('jsonrpc_method', rpcMethod);
    this.spans.set(rpcId, span);
  }
  onJsonRpcResponse(rpcId: number | string | null, rpcMethod: string): void {
    if (rpcId === null) {
      return;
    }
    const span = this.spans.get(rpcId);
    if (span) {
      span.setStatus({
        code: SpanStatusCode.OK,
      });
      span.end();
    }
    this.spans.delete(rpcId);
  }
  onJsonRpcError(rpcId: number | string | null, _rpcMethod: string, errorCode: number, errorMessage: string): void {
    if (rpcId === null) {
      return;
    }

    const span = this.spans.get(rpcId);
    if (span) {
      span.setAttribute('jsonrpc_error_code', errorCode);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage,
      });
      span.end();
    }

    this.spans.delete(rpcId);
  }
}
