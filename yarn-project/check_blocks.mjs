import { createAztecNodeClient } from '@aztec/aztec.js/node';

const rpcUrl = process.env.AZTEC_NODE_URL ?? '';
const count = parseInt(process.argv[2] ?? '20');

if (!rpcUrl || !count) {
  process.stderr.write('Missing RPC URL or count\n');
  process.exit(1);
}

const node = createAztecNodeClient(rpcUrl);
const blockNum = await node.getBlockNumber();
const start = Math.max(1, blockNum - count + 1);

for (let i = start; i <= blockNum; i++) {
  try {
    const [block, header] = await Promise.all([node.getBlock(i), node.getBlockHeader(i)]);
    if (!block || !header) continue;

    const txCount = block.body.txEffects.length;
    let totalFees = 0n;
    for (const tx of block.body.txEffects) {
      totalFees += tx.transactionFee.toBigInt();
    }
    const slot = Number(header.getSlot());
    const epochDuration = 32;
    const epoch = Math.floor(slot / epochDuration);
    const feePerL2 = BigInt(header.globalVariables.gasFees.feePerL2Gas.toString());
    const totalGas = feePerL2 > 0n ? totalFees / feePerL2 : 0n;
    const feesFJ = Number(totalFees / 10n ** 15n) / 1000;
    const avgGas = txCount > 0 ? Math.round(Number(totalGas) / txCount) : 0;
    const avgFee = txCount > 0 ? (feesFJ / txCount).toFixed(2) : '0';

    console.log(
      `Block ${i} | epoch ${epoch} | slot ${slot} | ${txCount} txs | ${totalGas} mana (${avgGas}/tx) | ${feesFJ.toFixed(2)} FJ (${avgFee}/tx) | base fee: ${feePerL2}`,
    );
  } catch (e) {
    console.log(`Block ${i}: error - ${e.message}`);
  }
}
