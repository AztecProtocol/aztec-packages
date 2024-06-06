import { Body } from '@aztec/aztec.js';
import * as fs from 'fs';

function loadBodies(): Body[] {
  const dir = '/mnt/user-data/jan/blocks'
  // Load all files in dir to buffers
  const files = fs.readdirSync(dir);
  const blocks = [];
  for (const file of files) {
    const buffer = fs.readFileSync(`${dir}/${file}`);
    blocks.push(Body.fromBuffer(buffer));
  }
  return blocks;
}

export function analyzeBodies(bodies: Body[]) {
  console.log('Num block bodies: ', bodies.length);
  const txEffects = bodies.flatMap(b => b.txEffects);
  console.log('Num tx effects: ', txEffects.length);

  // key = {num_nullifiers}_[log_0_length-log1_length-...-log_n_length]_[log_0_value-log_1_value-...-log_n_value]...
  const logLengths = new Map<string, number>();
  for (const { noteEncryptedLogs, nullifiers } of txEffects) {
    let key = `nullifiers:{${nullifiers.length}}-log_lengths:`;
    for (const functionLog of noteEncryptedLogs.functionLogs) {
      key += "["
      if (functionLog.logs.length === 0) {
        key += "]";
        continue;
      }
      for (const log of functionLog.logs) {
        key += log.length + "-";
      }
      key = key.slice(0, -1);
      key += "]";
    }
    if (!logLengths.has(key)) {
      logLengths.set(key, 0);
    }
    logLengths.set(key, logLengths.get(key)! + 1);
  }
  // Print key and values in a sorted order by value
  const sorted = [...logLengths.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, value] of sorted) {
    console.log(key, value);
  }
}

function main() {
//   const AZTEC_NODE_URL = 'http://localhost:8080';
//   const node = createAztecNodeClient(AZTEC_NODE_URL);
//   const blocks = await node.getBlocks(1, 1000);
//   await analyzeBlocks(blocks);
  const bodies = loadBodies();
  analyzeBodies(bodies);
}

main();
