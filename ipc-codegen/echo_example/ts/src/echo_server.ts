/**
 * Echo IPC server (TypeScript) — uses the GENERATED handleRequest (framing,
 * dispatch, and error wrapping) over the @aztec-foundation/ipc-runtime UDS transport.
 * Usage: npx tsx echo_server.ts --socket /tmp/echo.sock [--host-call peer=<path>]
 *
 * Relay calls out to "peer" with an ordinary await; the server runs each connection's requests
 * concurrently, so a peer that calls back in over a connection already waiting is answered.
 */
import { UdsIpcClient, UdsIpcServer } from "@aztec-foundation/ipc-runtime";
import { AsyncApi } from "./generated/async.js";
import { handleRequest } from "./generated/server.js";
import type { Handler } from "./generated/server.js";
import type {
  EchoBytes,
  EchoBytesResponse,
  EchoAliases,
  EchoAliasesResponse,
  EchoBlobs,
  EchoBlobsResponse,
  EchoFail,
  EchoFailResponse,
  EchoFields,
  EchoFieldsResponse,
  EchoNested,
  EchoNestedResponse,
  EchoRelay,
  EchoRelayResponse,
} from "./generated/api_types.js";

const args = process.argv.slice(2);
const socketIdx = args.indexOf("--socket");
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error("Usage: echo_server.ts --socket <path> [--host-call peer=<path>]");
  process.exit(1);
}
const peerPath = args
  .flatMap((arg, i) => (args[i - 1] === "--host-call" ? [arg] : []))
  .find((spec) => spec.startsWith("peer="))
  ?.slice("peer=".length);

let peer: Promise<AsyncApi> | undefined;
function connectPeer(): Promise<AsyncApi> {
  if (!peerPath) {
    return Promise.reject(
      new Error('no host-call target "peer" (start the server with --host-call peer=<path>)'),
    );
  }
  peer ??= UdsIpcClient.connect(peerPath).then((client) => new AsyncApi(client));
  return peer;
}

const handler: Handler = {
  async bytes(cmd: EchoBytes): Promise<EchoBytesResponse> {
    return { data: cmd.data };
  },
  async fields(cmd: EchoFields): Promise<EchoFieldsResponse> {
    return { a: cmd.a, b: cmd.b, name: cmd.name };
  },
  async nested(cmd: EchoNested): Promise<EchoNestedResponse> {
    return { inner: cmd.inner };
  },
  async aliases(cmd: EchoAliases): Promise<EchoAliasesResponse> {
    return {
      treeId: cmd.treeId,
      hash: cmd.hash,
      maybeHash: cmd.maybeHash,
      hashes: cmd.hashes,
    };
  },
  async blobs(cmd: EchoBlobs): Promise<EchoBlobsResponse> {
    return { maybeData: cmd.maybeData, parts: cmd.parts };
  },
  async fail(cmd: EchoFail): Promise<EchoFailResponse> {
    throw new Error(cmd.message);
  },
  async relay(cmd: EchoRelay): Promise<EchoRelayResponse> {
    if (cmd.hops === 0) {
      return { data: cmd.data };
    }
    const data = Uint8Array.from([...cmd.data, cmd.hops]);
    return (await connectPeer()).relay({ data, hops: cmd.hops - 1 });
  },
};

async function main() {
  await UdsIpcServer.listen(
    socketPath!,
    (_clientId, requestBytes) => handleRequest(handler, requestBytes),
    { concurrent: true },
  );
  console.error(`ipc-server(ts): listening on ${socketPath}`);
}

main().catch((e) => {
  console.error(`echo_server(ts): FAILED: ${e.message ?? e}`);
  process.exit(1);
});
