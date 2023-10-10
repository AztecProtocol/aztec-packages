import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

import { WitnessMap, executeCircuit } from '@noir-lang/acvm_js';

import { PrivateKernelInitArtifact } from './index.js';

describe('Private kernel', () => {
  let logger: DebugLogger;
  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel');
  });

  it('Executes private kernel init circuit with all zeroes', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const decodedBytecode = Buffer.from(PrivateKernelInitArtifact.bytecode, 'base64');
    const numWitnesses = 1811; // The number of input witnesses in the private kernel init circuit
    const initialWitness: WitnessMap = new Map();
    for (let i = 1; i <= numWitnesses; i++) {
      initialWitness.set(i, '0x00');
    }

    const _witnessMap = await executeCircuit(decodedBytecode, initialWitness, () => {
      throw Error('unexpected oracle during execution');
    });

    logger('Executed private kernel init circuit with all zeroes');
  });
});
