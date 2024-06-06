import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js';

export async function analyzeBlocks(node: AztecNode) {
  const blocks = await node.getBlocks(1, 1000);
  console.log('Num blocks: ', blocks.length);
  const txEffects = blocks.flatMap(b => b.body.txEffects);
  console.log('Num tx effects: ', txEffects.length);

  // key = [log_0_length-log1_length-...-log_n_length]_[log_0_value-log_1_value-...-log_n_value]...
  const logLengths = new Map<string, number>();
  for (const { noteEncryptedLogs } of txEffects) {
    let key = "";
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
  // Print key values
  for (const [key, value] of logLengths) {
    console.log(key, value);
  }
}

async function main() {
  const AZTEC_NODE_URL = 'http://localhost:8080';
  const node = createAztecNodeClient(AZTEC_NODE_URL);
  await analyzeBlocks(node);
}

main().catch(err => {
  console.log('Error: ', err);
  process.exit(1);
});
