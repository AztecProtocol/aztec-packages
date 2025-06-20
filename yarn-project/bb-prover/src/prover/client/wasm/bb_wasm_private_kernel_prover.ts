import { AztecClientBackend } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { serializeWitness } from '@aztec/noir-noirc_abi';
import type { ArtifactProvider } from '@aztec/noir-protocol-circuits-types/types';
import type { CircuitSimulator } from '@aztec/simulator/client';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import { ClientIvcProof } from '@aztec/stdlib/proofs';

import { ungzip } from 'pako';

import { BBPrivateKernelProver } from '../bb_private_kernel_prover.js';

export abstract class BBWASMPrivateKernelProver extends BBPrivateKernelProver {
  constructor(
    protected override artifactProvider: ArtifactProvider,
    protected override simulator: CircuitSimulator,
    private threads: number = 1,
    protected override log = createLogger('bb-prover:wasm'),
  ) {
    super(artifactProvider, simulator, log);
  }

  public override async createClientIvcProof(executionSteps: PrivateExecutionStep[]): Promise<ClientIvcProof> {
    const timer = new Timer();
    this.log.info(`Generating ClientIVC proof...`);
    const backend = new AztecClientBackend(
      executionSteps.map(step => ungzip(step.bytecode)),
      { threads: this.threads, logger: this.log.verbose, wasmPath: process.env.BB_WASM_PATH },
    );

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1297): the vk is not provided to the network anymore.
    // Move this sanity check inside the wasm code and remove the vk from the return value.
    const [proof, _vk] = await backend.prove(
      executionSteps.map(step => ungzip(serializeWitness(step.witness))),
      executionSteps.map(step => step.vk),
    );
    await backend.destroy();
    this.log.info(`Generated ClientIVC proof`, {
      eventName: 'client-ivc-proof-generation',
      duration: timer.ms(),
      proofSize: proof.length,
    });
    return new ClientIvcProof(Buffer.from(proof));
  }

  public override async computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
    // Note we do not pass the vk to the backend. This is unneeded for gate counts.
    const backend = new AztecClientBackend([ungzip(_bytecode)], {
      threads: this.threads,
      logger: this.log.verbose,
      wasmPath: process.env.BB_WASM_PATH,
    });

    const gateCount = await backend.gates();
    await backend.destroy();

    return gateCount[0];
  }
}
