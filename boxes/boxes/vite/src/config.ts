import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing";
import { createAztecNodeClient, createLogger } from "@aztec/aztec.js";
import { BBWASMLazyPrivateKernelProver } from "@aztec/bb-prover/wasm/lazy";
import { KeyStore } from "@aztec/key-store";
import { createStore } from "@aztec/kv-store/indexeddb";
import { L2TipsStore } from "@aztec/kv-store/stores";
import { PXEServiceConfig, getPXEServiceConfig } from "@aztec/pxe/config";
import { KVPxeDatabase } from "@aztec/pxe/database";
import { PXEService } from "@aztec/pxe/service";
import { WASMSimulator } from "@aztec/simulator/client";
import { BoxReactContractArtifact } from "../artifacts/BoxReact";

process.env = Object.keys(import.meta.env).reduce((acc, key) => {
  acc[key.replace("VITE_", "")] = import.meta.env[key];
  return acc;
}, {});

export class PrivateEnv {
  pxe;

  constructor(private nodeURL: string) {}

  async init() {
    const config = getPXEServiceConfig();
    config.dataDirectory = "pxe";
    config.proverEnabled = true;
    const aztecNode = await createAztecNodeClient(this.nodeURL);
    const simulationProvider = new WASMSimulator();
    const proofCreator = new BBWASMLazyPrivateKernelProver(
      simulationProvider,
      16,
    );
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const store = await createStore(
      "pxe_data",
      configWithContracts,
      createLogger("pxe:data:indexeddb"),
    );

    const keyStore = new KeyStore(store);

    const db = await KVPxeDatabase.create(store);
    const tips = new L2TipsStore(store, "pxe");

    this.pxe = new PXEService(
      keyStore,
      aztecNode,
      db,
      tips,
      proofCreator,
      simulationProvider,
      config,
    );
    await this.pxe.init();
  }

  async getWallet() {
    const wallet = (await getDeployedTestAccountsWallets(this.pxe))[0];
    if (!wallet) {
      console.error(
        "Wallet not found. Please connect the app to a testing environment with deployed and funded test accounts.",
      );
    }
    return wallet;
  }
}

export const deployerEnv = new PrivateEnv(process.env.AZTEC_NODE_URL);

const IGNORE_FUNCTIONS = [
  "constructor",
  "compute_note_hash_and_optionally_a_nullifier",
  "sync_notes",
];
export const filteredInterface = BoxReactContractArtifact.functions.filter(
  (f) => !IGNORE_FUNCTIONS.includes(f.name),
);
