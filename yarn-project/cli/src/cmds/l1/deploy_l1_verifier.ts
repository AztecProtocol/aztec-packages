import { createEthereumChain, createExtendedL1Client, deployL1Contract } from '@aztec/ethereum';
import type { LogFn } from '@aztec/foundation/log';
import { HonkVerifierAbi, HonkVerifierBytecode } from '@aztec/l1-artifacts';

import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export async function deployUltraHonkVerifier(
  ethRpcUrls: string[],
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  mnemonicIndex: number,
  log: LogFn,
) {
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!, { addressIndex: mnemonicIndex })
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  const extendedClient = createExtendedL1Client(
    ethRpcUrls,
    account,
    createEthereumChain(ethRpcUrls, l1ChainId).chainInfo,
  );

  const { address: verifierAddress } = await deployL1Contract(extendedClient, HonkVerifierAbi, HonkVerifierBytecode);
  log(`Deployed honk verifier at ${verifierAddress}`);

  log(`Rollup accepts only real proofs now`);
}

export async function deployMockVerifier(
  ethRpcUrls: string[],
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  log: LogFn,
) {
  const extendedClient = createExtendedL1Client(
    ethRpcUrls,
    privateKey ?? mnemonic,
    createEthereumChain(ethRpcUrls, l1ChainId).chainInfo,
  );
  const { MockVerifierAbi, MockVerifierBytecode } = await import('@aztec/l1-artifacts');

  const { address: mockVerifierAddress } = await deployL1Contract(
    extendedClient,
    MockVerifierAbi,
    MockVerifierBytecode,
  );
  log(`Deployed MockVerifier at ${mockVerifierAddress.toString()}`);
}
