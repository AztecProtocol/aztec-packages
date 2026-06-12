/**
 * Echo IPC server (TypeScript) — uses the GENERATED handleRequest (framing,
 * dispatch, and error wrapping) over the @aztec/ipc-runtime UDS transport.
 * Usage: npx tsx echo_server.ts --socket /tmp/echo.sock
 */
import { UdsIpcServer } from "@aztec/ipc-runtime";
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
} from "./generated/api_types.js";

const args = process.argv.slice(2);
const socketIdx = args.indexOf("--socket");
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error("Usage: echo_server.ts --socket <path>");
  process.exit(1);
}

const handler: Handler = {
  async echoBytes(cmd: EchoBytes): Promise<EchoBytesResponse> {
    return { data: cmd.data };
  },
  async echoFields(cmd: EchoFields): Promise<EchoFieldsResponse> {
    return { a: cmd.a, b: cmd.b, name: cmd.name };
  },
  async echoNested(cmd: EchoNested): Promise<EchoNestedResponse> {
    return { inner: cmd.inner };
  },
  async echoAliases(cmd: EchoAliases): Promise<EchoAliasesResponse> {
    return {
      treeId: cmd.treeId,
      hash: cmd.hash,
      maybeHash: cmd.maybeHash,
      hashes: cmd.hashes,
    };
  },
  async echoBlobs(cmd: EchoBlobs): Promise<EchoBlobsResponse> {
    return { maybeData: cmd.maybeData, parts: cmd.parts };
  },
  async echoFail(cmd: EchoFail): Promise<EchoFailResponse> {
    throw new Error(cmd.message);
  },
};

async function main() {
  await UdsIpcServer.listen(socketPath!, (_clientId, requestBytes) =>
    handleRequest(handler, requestBytes),
  );
  console.error(`ipc-server(ts): listening on ${socketPath}`);
}

main().catch((e) => {
  console.error(`echo_server(ts): FAILED: ${e.message ?? e}`);
  process.exit(1);
});
