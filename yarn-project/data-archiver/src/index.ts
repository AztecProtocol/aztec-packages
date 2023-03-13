import { getAddress } from 'viem';
import { DataArchiver } from './data_archiver.js';

const {
  ETHEREUM_HOST = 'http://localhost:8545/',
  ROLLUP_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  YEETER_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
} = process.env;

/**
 * A function which instantiates and starts DataArchiver.
 */
async function main() {
  const rollupAddress = getAddress(ROLLUP_ADDRESS);
  const yeeterAddress = getAddress(YEETER_ADDRESS);
  const dataArchiver = new DataArchiver(new URL(ETHEREUM_HOST), rollupAddress, yeeterAddress);

  const shutdown = () => {
    dataArchiver.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await dataArchiver.start();
}

main().then(
  () => {
    console.log('DataArchiver started successfully.');
  },
  err => {
    console.error('DataArchiver failed to start:', err);
    process.exit(1);
  },
);
