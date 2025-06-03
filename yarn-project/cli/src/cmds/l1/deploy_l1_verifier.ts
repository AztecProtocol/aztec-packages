import { createCompatibleClient } from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client, deployL1Contract } from '@aztec/ethereum';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { HonkVerifierAbi, HonkVerifierBytecode } from '@aztec/l1-artifacts';

import { InvalidOptionArgumentError } from 'commander';
import { type Hex, getContract } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export async function deployUltraHonkVerifier(
  rollupAddress: Hex | undefined,
  ethRpcUrls: string[],
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  pxeRpcUrl: string,
  log: LogFn,
  debugLogger: Logger,
) {
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!, { addressIndex: mnemonicIndex })
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  const extendedClient = createExtendedL1Client(
    ethRpcUrls,
    account,
    createEthereumChain(ethRpcUrls, l1ChainId).chainInfo,
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
    client: extendedClient,
  });

  const { address: verifierAddress } = await deployL1Contract(extendedClient, HonkVerifierAbi, HonkVerifierBytecode);
  log(`Deployed honk verifier at ${verifierAddress}`);

  await rollup.write.setEpochVerifier([verifierAddress.toString()]);

  log(`Rollup accepts only real proofs now`);
}

export async function deployMockVerifier(
  rollupAddress: Hex | undefined,
  ethRpcUrls: string[],
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  pxeRpcUrl: string,
  log: LogFn,
  debugLogger: Logger,
) {
  const extendedClient = createExtendedL1Client(
    ethRpcUrls,
    privateKey ?? mnemonic,
    createEthereumChain(ethRpcUrls, l1ChainId).chainInfo,
  );
  const { MockVerifierAbi, MockVerifierBytecode, RollupAbi } = await import('@aztec/l1-artifacts');

  const { address: mockVerifierAddress } = await deployL1Contract(
    extendedClient,
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
    client: extendedClient,
  });

  await rollup.write.setEpochVerifier([mockVerifierAddress.toString()]);
  log(`Rollup accepts only fake proofs now`);
}
