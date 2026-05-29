/**
 * Echo IPC server (TypeScript) — uses GENERATED dispatch + the
 * @aztec/ipc-runtime UDS transport.
 * Usage: npx tsx echo_server.ts --socket /tmp/echo.sock
 */
import { UdsIpcServer } from "@aztec/ipc-runtime";
import { Decoder, Encoder } from "msgpackr";
import { dispatch } from "./generated/server.js";
import type { Handler } from "./generated/server.js";
import type {
  EchoBytes,
  EchoBytesResponse,
  EchoAliases,
  EchoAliasesResponse,
  EchoFields,
  EchoFieldsResponse,
  EchoNested,
  EchoNestedResponse,
} from "./generated/echo_types.js";

const encoder = new Encoder({ useRecords: false, variableMapSize: true });
const decoder = new Decoder({ useRecords: false });

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
};

async function main() {
  const server = await UdsIpcServer.listen(
    socketPath,
    async (_clientId, requestBytes) => {
      const [[commandName, payload]] = decoder.unpack(requestBytes) as [
        [string, any],
      ];

      if (commandName.endsWith("Shutdown")) {
        const respName = `${commandName}Response`;
        const responseBytes = encoder.pack([respName, {}]);
        setTimeout(() => server.close().catch(() => {}), 50);
        return responseBytes;
      }

      try {
        const [respName, respPayload] = await dispatch(
          handler,
          commandName,
          payload ?? {},
        );
        return encoder.pack([respName, respPayload]);
      } catch (err: any) {
        return encoder.pack([
          "ErrorResponse",
          { message: err?.message ?? "Unknown error" },
        ]);
      }
    },
  );
  console.error(`ipc-server(ts): listening on ${socketPath}`);
}

main().catch((e) => {
  console.error(`echo_server(ts): FAILED: ${e.message ?? e}`);
  process.exit(1);
});
