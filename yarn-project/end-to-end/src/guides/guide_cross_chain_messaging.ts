/* eslint-disable no-console */
import {
  AccountWallet,
  AztecAddress,
  EthAddress,
  Fr,
  computeMessageSecretHash,
  createPXEClient,
  getSandboxAccountsWallets,
} from '@aztec/aztec.js';

// we are using viem for this demo although the dev may use ethers!
import { Chain, HttpTransport, createPublicClient, createWalletClient, getContract, http } from 'viem';
import { HDAccount, mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';


// this import isn't needed in the docs.
import { fileURLToPath } from '@aztec/foundation/url';
// TODO - this shouldn't be part of the guide - you get the abi from artifacts that are generated locally.
import { OutboxAbi } from '@aztec/l1-artifacts';
// TODO - import TokenBridge, Uniswap not from @aztec/noir-contracts but locally! Show this in docs!
import { TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';


// TODO show this code and not just import -
import { deployAndInitializeTokenAndBridgeContracts } from '../fixtures/utils.js';

const { PXE_URL = 'http://localhost:8080', ETHEREUM_HOST = 'http://localhost:8545' } = process.env;
const MNEMONIC = 'test test test test test test test test test test test junk';

const hdAccount = mnemonicToAccount(MNEMONIC);
const walletClient = createWalletClient<HttpTransport, Chain, HDAccount>({
  account: hdAccount,
  chain: foundry,
  transport: http(ETHEREUM_HOST),
});
const publicClient = createPublicClient({
  chain: foundry,
  transport: http(ETHEREUM_HOST),
});

// In docs, show how to fetch the ABI, BYTECIDE from the artifacts that the solidity compiler generates.
// ref https://github.com/rahul-kothari/aztec-sandbox-l1l2-init/blob/main/packages/src/utils/l1_contracts.mjs#L13
// const OutboxAbi = ...
// const PortalERC20Abi = ...
// const PortalERC20Bytecode = ...
// const TokenPortalAbi = ...
// const TokenPortalBytecode = ...

// outbox contract instance
let outbox: any;

let ethAccount: EthAddress;
let user1Wallet: AccountWallet;
let user1Address: AztecAddress;
let user2Wallet: AccountWallet;
let user2Address: AztecAddress;

/**
 * CrossChainHarness is a helper class that maintains the token and its portal contracts across L1 and L2
 */
class CrossChainHarness {
  static async new(
    registryAddress: EthAddress,
    ownerWallet: AccountWallet,
    ownerAddress: AztecAddress,
    underlyingERC20Address?: EthAddress,
  ) {
    console.log('Deploying and initializing token, portal and its bridge...');
    // todo - include the code in `deployAndInitializeTokenAndBridgeContracts()` too!
    const contracts = await deployAndInitializeTokenAndBridgeContracts(
      ownerWallet,
      walletClient,
      publicClient,
      registryAddress,
      ownerAddress,
      underlyingERC20Address,
    );
    const l2Token = contracts.token;
    const l2Bridge = contracts.bridge;
    const underlyingERC20 = contracts.underlyingERC20;
    const tokenPortal = contracts.tokenPortal;
    const tokenPortalAddress = contracts.tokenPortalAddress;
    console.log('Deployed and initialized token, portal and its bridge.');

    return new CrossChainHarness(l2Token, l2Bridge, tokenPortalAddress, tokenPortal, underlyingERC20);
  }

  constructor(
    /** L2 Token contract. */
    public l2Token: TokenContract,
    /** L2 Token bridge contract. */
    public l2Bridge: TokenBridgeContract,
    /** Portal address. */
    public tokenPortalAddress: EthAddress,
    /** Token portal instance. */
    public tokenPortal: any,
    /** Underlying token for portal tests. */
    public underlyingERC20: any,
  ) {}
}

/**
 * Generate a claim secret using pedersen
 * @returns secret and its hash
 */
async function generateClaimSecret(): Promise<[Fr, Fr]> {
  console.log("Generating a claim secret using pedersen's hash function");
  const secret = Fr.random();
  const secretHash = await computeMessageSecretHash(secret);
  console.log('Generated claim secret: ' + secretHash.toString(true));
  return [secret, secretHash];
}

/**
 * Main function...
 */
async function main() {
  const pxe = createPXEClient(PXE_URL);
  [user1Wallet, user2Wallet] = await getSandboxAccountsWallets(pxe);
  user1Address = user1Wallet.getAddress();
  const aztecL1ContractAddresses = (await pxe.getNodeInfo()).l1ContractAddresses;
  const crossChainHarness = await CrossChainHarness.new(
    aztecL1ContractAddresses.registryAddress,
    user1Wallet,
    user1Address,
  );
  ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
  outbox = getContract({
    address: aztecL1ContractAddresses.outboxAddress.toString(),
    abi: OutboxAbi,
    publicClient,
  });

  // TODO - show cross chain communication here as shown in e2e_cross_chain_messaging.test.ts and e2e_public_cross_chain_messaging.test.ts
  /**
   * 1. Mint tokens on L1 to ethAccount
   * 2. Deposit tokens to portal (crossChainHarness.tokenPortal.depositToAztecPrivate)
   * 3. Mint on L2 - (crossChainHarness.l2Bridge.claim_private)
   * 4. Redeem l2 tokens - crossChainHarness.l2Token.redeemShield
   * Time to withdraw:
   * 5. Withdraw tokens to L1 - Approve bridge to burn owner's funds - computeAuthWitMessageHash()
   * 6. Withdraw tokens to L1 - crossChainHarness.l2Bridge.exit_to_L1_private
   * 7. Exit on L1 - derive expected message key (done in crossChainTestHarness.checkEntryIsNotInOutbox())
   * 8. Exit on L1 -  crossChainTestHarness.tokenPortal.withdraw()
   */
  // Do same for private

  // In another file, do uniswap flow...
}

// Execute main only if run directly
if (process.argv[1].replace(/\/index\.m?js$/, '') === fileURLToPath(import.meta.url).replace(/\/index\.m?js$/, '')) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(`Error in app: ${err}`);
      process.exit(1);
    });
}

export { main };
