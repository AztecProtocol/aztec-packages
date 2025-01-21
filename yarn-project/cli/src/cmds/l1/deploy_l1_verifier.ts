import { createCompatibleClient } from '@aztec/aztec.js';
import { createEthereumChain, createL1Clients, deployL1Contract } from '@aztec/ethereum';
import { type LogFn, type Logger } from '@aztec/foundation/log';
import { HonkVerifierAbi, HonkVerifierBytecode } from '@aztec/l1-artifacts';

import { InvalidOptionArgumentError } from 'commander';
import { type Hex, getContract } from 'viem';

export async function deployUltraHonkVerifier(
  rollupAddress: Hex | undefined,
  ethRpcUrl: string,
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  pxeRpcUrl: string,
  bbBinaryPath: string,
  bbWorkingDirectory: string,
  log: LogFn,
  debugLogger: Logger,
) {
  if (!bbBinaryPath || !bbWorkingDirectory) {
    throw new InvalidOptionArgumentError('Missing path to bb binary and working directory');
  }

  const { publicClient, walletClient } = createL1Clients(
    ethRpcUrl,
    privateKey ?? mnemonic,
    createEthereumChain(ethRpcUrl, l1ChainId).chainInfo,
  );

  if (!rollupAddress && pxeRpcUrl) {
    const pxe = await createCompatibleClient(pxeRpcUrl, debugLogger);
    const { l1ContractAddresses } = await pxe.getNodeInfo();
    rollupAddress = l1ContractAddresses.rollupAddress.toString();
  }

  if (!rollupAddress) {
    throw new InvalidOptionArgumentError('Missing rollup address');
  }

  const { RollupAbi } = await import('@aztec/l1-artifacts');

  const rollup = getContract({
    abi: RollupAbi,
    address: rollupAddress,
    client: walletClient,
  });

  const { address: verifierAddress } = await deployL1Contract(
    walletClient,
    publicClient,
    HonkVerifierAbi,
    HonkVerifierBytecode,
  );
  log(`Deployed honk verifier at ${verifierAddress}`);

  await rollup.write.setEpochVerifier([verifierAddress.toString()]);

  log(`Rollup accepts only real proofs now`);
}

export async function deployMockVerifier(
  rollupAddress: Hex | undefined,
  ethRpcUrl: string,
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  pxeRpcUrl: string,
  log: LogFn,
  debugLogger: Logger,
) {
  const { publicClient, walletClient } = createL1Clients(
    ethRpcUrl,
    privateKey ?? mnemonic,
    createEthereumChain(ethRpcUrl, l1ChainId).chainInfo,
  );
  const { MockVerifierAbi, MockVerifierBytecode, RollupAbi } = await import('@aztec/l1-artifacts');

  const { address: mockVerifierAddress } = await deployL1Contract(
    walletClient,
    publicClient,
    MockVerifierAbi,
    MockVerifierBytecode,
  );
  log(`Deployed MockVerifier at ${mockVerifierAddress.toString()}`);

  if (!rollupAddress && pxeRpcUrl) {
    const pxe = await createCompatibleClient(pxeRpcUrl, debugLogger);
    const { l1ContractAddresses } = await pxe.getNodeInfo();
    rollupAddress = l1ContractAddresses.rollupAddress.toString();
  }

  if (!rollupAddress) {
    throw new InvalidOptionArgumentError('Missing rollup address');
  }

  const rollup = getContract({
    abi: RollupAbi,
    address: rollupAddress,
    client: walletClient,
  });

  await rollup.write.setEpochVerifier([mockVerifierAddress.toString()]);
  log(`Rollup accepts only fake proofs now`);
}
