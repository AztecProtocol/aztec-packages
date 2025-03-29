import { ForwarderContract } from '../contracts/index.js';

const ownerAddress = process.argv[2];
if (!ownerAddress) {
  process.stderr.write('Please provide an owner address as an argument\n');
  process.exit(1);
}

// Ensure the address starts with 0x
const formattedAddress = ownerAddress.startsWith('0x') ? ownerAddress : `0x${ownerAddress}`;
const address = ForwarderContract.expectedAddress(formattedAddress as `0x${string}`);
process.stdout.write(`${address}\n`);
