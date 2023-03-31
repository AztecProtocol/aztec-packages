import { AcirSimulator } from '@aztec/acir-simulator';
import { AztecNode } from '@aztec/aztec-node';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { KernelProver } from '@aztec/kernel-prover';
import { MemoryDB } from '../database/index.js';
import { KeyStore, TestKeyStore } from '../key_store/index.js';
import { SimulatorOracle } from '../simulator_oracle/index.js';
import { AztecRPCServer } from './aztec_rpc_server.js';
import { Grumpkin } from '@aztec/barretenberg.js/crypto';

export async function createAztecRPCServer(
  aztecNode: AztecNode,
  {
    keyStore,
    db,
    acirSimulator,
    kernelProver,
    bbWasm,
  }: {
    keyStore?: KeyStore;
    db?: MemoryDB;
    acirSimulator?: AcirSimulator;
    kernelProver?: KernelProver;
    bbWasm?: BarretenbergWasm;
  } = {},
) {
  bbWasm = bbWasm || (await BarretenbergWasm.new());
  keyStore = keyStore || new TestKeyStore(new Grumpkin(bbWasm));
  db = db || new MemoryDB();
  acirSimulator = acirSimulator || new AcirSimulator(new SimulatorOracle(db, keyStore));
  kernelProver = kernelProver || new KernelProver();

  return await Promise.resolve(new AztecRPCServer(keyStore, acirSimulator, kernelProver, aztecNode, db));
}
