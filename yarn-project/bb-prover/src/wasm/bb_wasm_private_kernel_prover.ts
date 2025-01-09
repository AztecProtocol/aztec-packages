import { AztecClientBackend } from '@aztec/bb.js';
import { ClientIvcProof } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ArtifactProvider } from '@aztec/noir-protocol-circuits-types/types';

import { type WitnessMap } from '@noir-lang/noir_js';
import { serializeWitness } from '@noir-lang/noirc_abi';
import { ungzip } from 'pako';

import { BBPrivateKernelProver } from '../prover/bb_private_kernel_prover.js';

export abstract class BBWASMPrivateKernelProver extends BBPrivateKernelProver {
  constructor(
    protected override artifactProvider: ArtifactProvider,
    private threads: number = 1,
    protected override log = createLogger('bb-prover:wasm'),
  ) {
    super(artifactProvider, log);
  }

  public override async createClientIvcProof(acirs: Buffer[], witnessStack: WitnessMap[]): Promise<ClientIvcProof> {
    const timer = new Timer();
    this.log.info(`Generating ClientIVC proof...`);
    const backend = new AztecClientBackend(
      acirs.map(acir => ungzip(acir)),
      { threads: this.threads },
    );

    const [proof, vk] = await backend.prove(witnessStack.map(witnessMap => ungzip(serializeWitness(witnessMap))));
    await backend.destroy();
    this.log.info(`Generated ClientIVC proof`, {
      eventName: 'client-ivc-proof-generation',
      duration: timer.ms(),
      proofSize: proof.length,
      vkSize: vk.length,
    });
    return new ClientIvcProof(Buffer.from(proof), Buffer.from(vk));
  }
}
