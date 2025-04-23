import { VERSION } from './constants';
import { AztecAddress, type NoirCompiledContract } from '@aztec/aztec.js';
import SponsoredFPCContractArtifactJson from '../assets/artifacts/0.85.0-alpha-testnet.2/sponsored_fpc_contract-SponsoredFPC.json' assert { type: 'json' };

export type Network = {
  nodeURL: string;
  name: string;
  description: string;
  hasTestAccounts: boolean;
  hasSponsoredFPC: boolean;
  sponsoredFPCAddress?: AztecAddress;
  sponsoredFPCContractArtifact?: NoirCompiledContract;
};

export const NETWORKS: Network[] = [
  {
    nodeURL: 'https://35.182.93.169:443',
    name: 'Aztec Testnet',
    description: 'Public testnet',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    sponsoredFPCAddress: AztecAddress.fromString('0x0b27e30667202907fc700d50e9bc816be42f8141fae8b9f2281873dbdb9fc2e5'),
    sponsoredFPCContractArtifact: SponsoredFPCContractArtifactJson,
  },
  {
    nodeURL: 'http://34.169.170.55:8080',
    name: 'Aztec Devnet',
    description: 'Public development network',
    hasTestAccounts: false,
    hasSponsoredFPC: true,
    sponsoredFPCAddress: AztecAddress.fromString('0x2742bae7b298acd9ae3f09ff48f6e6254f1e28bb71fbec9b6e79fe9955adf83c'),
    sponsoredFPCContractArtifact: SponsoredFPCContractArtifactJson,
  },
  {
    nodeURL: 'http://localhost:8080',
    name: 'Local Sandbox',
    description: `Run your own sandbox (v${VERSION})`,
    hasTestAccounts: true,
    hasSponsoredFPC: true,
  },
];
