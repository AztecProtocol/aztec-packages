/**
 * Echo IPC server (TypeScript) — uses GENERATED dispatch + IPC server template.
 * Usage: npx tsx echo_server.ts --socket /tmp/echo.sock
 */
import { createServer } from './generated/ipc_server.js';
import { dispatch } from './generated/server.js';
import type { Handler } from './generated/server.js';
import type {
  EchoBytes, EchoBytesResponse,
  EchoFields, EchoFieldsResponse,
  EchoNested, EchoNestedResponse,
} from './generated/echo_types.js';

const args = process.argv.slice(2);
const socketIdx = args.indexOf('--socket');
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
if (!socketPath) {
  console.error('Usage: echo_server.ts --socket <path>');
  process.exit(1);
}

// Implement the GENERATED Handler interface — echo everything back
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
};

createServer(socketPath, (commandName, payload) => dispatch(handler, commandName, payload));
