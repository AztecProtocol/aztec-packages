process.env.HARDWARE_CONCURRENCY ??= '2';

const { createLogger } = await import('@aztec/aztec.js/log');
const { startHttpRpcServer } = await import('@aztec/foundation/json-rpc/server');
const { createTXERpcServer } = await import('./dest/server.bundle.js');

const logger = createLogger('txe:rpc');
const server = await createTXERpcServer(logger);
const { port } = await startHttpRpcServer(server, {
  host: '127.0.0.1',
  port: Number(process.env.TXE_PORT ?? 14730),
  timeoutMs: 300000,
});

logger.info('TXE listening', { port });
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

await new Promise(() => {});
