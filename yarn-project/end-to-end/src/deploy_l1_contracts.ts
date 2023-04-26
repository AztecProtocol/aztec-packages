import { EthAddress } from '@aztec/foundation';
import {
  RollupAbi,
  RollupBytecode,
  UnverifiedDataEmitterAbi,
  UnverifiedDataEmitterBytecode,
} from '@aztec/l1-contracts/viem';
import type { Abi, Narrow } from 'abitype';
import {
  Account,
  Chain,
  Hex,
  HttpTransport,
  PublicClient,
  WalletClient,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { HDAccount } from 'viem/accounts';
import { localhost } from 'viem/chains';

export const deployL1Contracts = async (rpcUrl: string, account: HDAccount) => {
  const anvil = {
    ...localhost,
    id: 31337,
  } as const;

  const walletClient = createWalletClient({
    account,
    chain: anvil,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: anvil,
    transport: http(),
  });

  return {
    rollupAddress: await deployL1Contract(walletClient, publicClient, RollupAbi, RollupBytecode),
    unverifiedDataEmitterAddress: await deployL1Contract(
      walletClient,
      publicClient,
      UnverifiedDataEmitterAbi,
      UnverifiedDataEmitterBytecode,
    ),
  };
};

async function deployL1Contract(
  walletClient: WalletClient<HttpTransport, Chain, Account>,
  publicClient: PublicClient<HttpTransport, Chain>,
  abi: Narrow<Abi | readonly unknown[]>,
  bytecode: Hex,
) {
  const hash = await walletClient.deployContract({
    abi,
    bytecode,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress;
  if (!contractAddress) {
    throw new Error(`No contract address found in receipt: ${JSON.stringify(receipt)}`);
  }

  return EthAddress.fromString(receipt.contractAddress!);
}
