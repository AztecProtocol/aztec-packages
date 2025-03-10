import { AztecClientBackend } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ArtifactProvider } from '@aztec/noir-protocol-circuits-types/types';
import type { SimulationProvider } from '@aztec/simulator/client';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import { ClientIvcProof } from '@aztec/stdlib/proofs';

import { serializeWitness } from '@noir-lang/noirc_abi';
import { ungzip } from 'pako';

import { BBPrivateKernelProver } from '../prover/bb_private_kernel_prover.js';

export abstract class BBWASMPrivateKernelProver extends BBPrivateKernelProver {
  constructor(
    protected override artifactProvider: ArtifactProvider,
    protected override simulationProvider: SimulationProvider,
    private threads: number = 1,
    protected override log = createLogger('bb-prover:wasm'),
  ) {
    super(artifactProvider, simulationProvider, log);
  }

  public override async createClientIvcProof(executionSteps: PrivateExecutionStep[]): Promise<ClientIvcProof> {
    const timer = new Timer();
    this.log.info(`Generating ClientIVC proof...`);
    const backend = new AztecClientBackend(
      executionSteps.map(step => ungzip(step.bytecode)),
      { threads: this.threads, logger: this.log.verbose, wasmPath: process.env.BB_WASM_PATH },
    );

    const [proof, vk] = await backend.prove(executionSteps.map(step => ungzip(serializeWitness(step.witness))));
    await backend.destroy();
    this.log.info(`Generated ClientIVC proof`, {
      eventName: 'client-ivc-proof-generation',
      duration: timer.ms(),
      proofSize: proof.length,
      vkSize: vk.length,
    });
    return new ClientIvcProof(Buffer.from(proof), Buffer.from(vk));
  }

  public override async computeGateCountForCircuit(_bytecode: Buffer, _circuitName: string): Promise<number> {
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
