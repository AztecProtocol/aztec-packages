import { ForwarderContract } from '../contracts/index.js';

// Ensure the address starts with 0x
const address = ForwarderContract.expectedAddress();
process.stdout.write(`${address}\n`);
