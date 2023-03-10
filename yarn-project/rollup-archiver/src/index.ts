import { RollupArchiver } from './rollup_archiver.js';

const {
  ETHEREUM_HOST = 'https://mainnet.infura.io/v3/9928b52099854248b3a096be07a6b23c',
  ROLLUP_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000',
} = process.env;

/**
 * A function which instantiates and starts RollupArchiver.
 */
function main() {
  const rollupArchiver = new RollupArchiver(ETHEREUM_HOST, ROLLUP_CONTRACT_ADDRESS);

  const shutdown = async () => {
    await rollupArchiver.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  rollupArchiver.start();
}

main();
