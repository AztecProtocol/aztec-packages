import { createAztecNodeClient } from '@aztec/aztec.js';

async function main() {
  const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8545';
  const node = createAztecNodeClient(AZTEC_NODE_URL);
  const blocks = await node.getBlocks(1, 1000);
  const txEffects = blocks.flatMap(b => b.body.txEffects);

  // key = {num_logs_func_0}_{log_length_func_0}-{num_logs_func_1}_{log_length_func_1}...
  // value
  for (const { noteEncryptedLogs } of txEffects) {
    // const key = "";
    console.log('=====================================');
    for (const functionLog of noteEncryptedLogs.functionLogs) {
      // key += `${functionLog.logs.length}_${functionLog.logs[0].length}-`;
      const lengths = functionLog.logs.map(log => log.length);
      console.log(functionLog.logs.length, functionLog.logs[0].length, lengths);
    }
  }
}

main().catch(err => {
  console.log('Error: ', err);
  process.exit(1);
});
