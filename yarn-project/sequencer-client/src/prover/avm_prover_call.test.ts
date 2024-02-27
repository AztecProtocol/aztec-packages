// import { AztecAddress } from '@aztec/foundation/aztec-address';
// import { keccak, pedersenHash, poseidonHash, sha256 } from '@aztec/foundation/crypto';
// import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';

// import { AvmTestContractArtifact } from '@aztec/noir-contracts.js';
// import { jest } from '@jest/globals';
import { CliAvmProver } from './empty.js';

describe('AVM simulator', () => {
  it('Should execute bytecode that performs basic addition', async () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];
    const bytecode: Buffer = Buffer.from('HwAAAAAAAAAAAgAAAAAAAAYAAAAAAAAAAQAAAAI3AAAAAAIAAAAB', 'base64');

    const prover = new CliAvmProver();
    const proof = await prover.getAvmProof(calldata, bytecode);
    const log = createDebugLogger('avm::prover::test');
    log.debug(`Proof is ${proof}`);

    // expect(results.reverted).toBe(false);
    //
    // const returnData = results.output;
    // expect(returnData.length).toBe(1);
    // expect(returnData).toEqual([new Fr(3)]);
  });
});
