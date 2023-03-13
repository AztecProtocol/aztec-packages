import { getAddress } from 'viem';
import { RollupArchiver } from './rollup_archiver.js';

const {
  ETHEREUM_HOST = 'http://localhost:8545/',
  ROLLUP_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  YEETER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
} = process.env;

/**
 * A function which instantiates and starts RollupArchiver.
 */
async function main() {
  const rollupAddress = getAddress(ROLLUP_ADDRESS);
  const yeeterAddress = getAddress(YEETER_ADDRESS);
  const rollupArchiver = new RollupArchiver(ETHEREUM_HOST, rollupAddress, yeeterAddress);

  const shutdown = () => {
    rollupArchiver.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await rollupArchiver.start();
}

main().then(
  () => {
    console.log('Rollup archiver has started successfully.');
  },
  err => {
    console.error('Rollup archiver has failed to start:', err);
    process.exit(1);
  },
);
