import { type EthAddress } from '@aztec/circuits.js';
import { createEthereumChain } from '@aztec/ethereum';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export function generateL1Account() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  account.address;
  return {
    privateKey,
    address: account.address,
  };
}

export async function addL1Validator(
  rpcUrl: string,
  chainId: number,
  // the private key of the rollup owner
  privateKey: string | undefined,
  // the mnemonic of the rollup owner
  mnemonic: string,
  validatorAddress: EthAddress,
  rollupAddress: EthAddress,
  log: LogFn,
  debugLogger: DebugLogger,
) {
  const chain = createEthereumChain(rpcUrl, chainId);
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!)
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: chain.chainInfo, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: chain.chainInfo, transport: http(rpcUrl) });
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });
  let msg = `Adding validator ${validatorAddress.toString()} to rollup ${rollupAddress.toString()}`;
  log(msg);
  debugLogger.info(msg);
  const txHash = await rollup.write.addValidator([validatorAddress.toString()]);
  msg = `Transaction hash: ${txHash}`;
  log(msg);
  debugLogger.info(msg);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
