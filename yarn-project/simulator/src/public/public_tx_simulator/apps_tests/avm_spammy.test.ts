import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import {
  executeDivSpamPublicTx,
  executeKeccakSpamPublicTx,
  executePoseidonSpamPublicTx,
  executeSha256SpamPublicTx,
  executeXorSpamPublicTx,
} from '../../fixtures/spammy_txs.js';

describe('Public TX simulator apps tests: Spammy contracts', () => {
  let tester: PublicTxSimulationTester;

  beforeEach(async () => {
    tester = await PublicTxSimulationTester.create();
  });

  it('Keccak Spam Tx works', async () => {
    const result = await executeKeccakSpamPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('DIV Spam Tx works', async () => {
    const result = await executeDivSpamPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('XOR Spam Tx works', async () => {
    const result = await executeXorSpamPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('Poseidon2 Spam Tx works', async () => {
    const result = await executePoseidonSpamPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });

  it('SHA256 Compression Spam Tx works', async () => {
    const result = await executeSha256SpamPublicTx(tester);
    expect(result.revertCode.isOK()).toBe(true);
  });
});
