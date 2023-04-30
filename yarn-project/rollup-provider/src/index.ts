import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { appFactory } from './app.js';
import http from 'http';

const { PORT = 9000 } = process.env;

async function main() {
  const aztecNodeConfig: AztecNodeConfig = getConfigEnvVars();
  const node = await AztecNodeService.createAndSync(aztecNodeConfig);

  const shutdown = async () => {
    await node.stop();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  const app = appFactory(node, '');

  const httpServer = http.createServer(app.callback());
  httpServer.listen(PORT);
  console.log(`Server listening on port ${PORT}.`);
}

main().catch(err => {
  console.log(err);
  process.exit(1);
});
