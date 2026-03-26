import { AztecAddress } from '@aztec/aztec.js/addresses';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { getFeeJuiceBalance } from '@aztec/aztec.js/utils';

const rpcUrl = process.env.AZTEC_NODE_URL ?? '';
const fpcAddress = process.argv[2] ?? '';

if (!rpcUrl || !fpcAddress) {
  process.stderr.write('Missing RPC URL or FPC address\n');
  process.exit(1);
}

const node = createAztecNodeClient(rpcUrl);
const fpc = AztecAddress.fromString(fpcAddress);
const balance = await getFeeJuiceBalance(fpc, node);
const fj = Number(balance / 10n ** 15n) / 1000;
console.log(`Address: ${fpcAddress}`);
console.log(`Balance: ${balance.toString()} (${fj.toFixed(2)} FJ)`);
