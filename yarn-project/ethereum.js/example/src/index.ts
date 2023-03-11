import sourceMapSupport from 'source-map-support';
sourceMapSupport.install();
import { EthAddress } from '@aztec/ethereum.js/eth_address';
import { WalletProvider } from '@aztec/ethereum.js/provider';
import { EthereumRpc } from '@aztec/ethereum.js/eth_rpc';
import { fromBaseUnits, toBaseUnits } from '@aztec/ethereum.js/units';
import { ERC20Mintable } from './contracts/ERC20Mintable.js';
import { EthAccount } from '@aztec/ethereum.js/eth_account';
import { EthWallet } from '@aztec/ethereum.js/eth_wallet';
import { hashMessage, recover, sign } from '@aztec/ethereum.js/eth_sign';
import { RollupProcessorContract } from './contracts/RollupProcessorContract.js';
import { DaiContract } from './contracts/DaiContract.js';

const { ETHEREUM_HOST } = process.env;

/**
 * A few examples of how to use ethereum.js.
 * The imported contracts are created by gen_def and provide complete type safety on methods, logs, receipts etc.
 * See `contracts.json` in project root, and run `yarn contract_gen_def` to rebuild contract definitions.
 */
async function main() {
  if (!ETHEREUM_HOST) {
    throw new Error('No ETHEREUM_HOST provided.');
  }

  // We could allow the ETHEREUM_HOST to do the signing if the host is something like anvil.
  // However, that's not very realistic, most hosts don't have accounts on them.
  // We construct a local wallet using the same mnemonic that anvil uses, and create a provider from it.
  // This means all signing happens locally before being sent to the ETHEREUM_HOST.
  const wallet = EthWallet.fromMnemonic('test test test test test test test test test test test junk', 10);
  const provider = WalletProvider.fromHost(ETHEREUM_HOST, wallet);
  const ethRpc = new EthereumRpc(provider);

  // Grab a couple of account addresses from our wallet.
  const [acc1, acc2] = wallet.accounts.map(a => a.address);

  console.log(`Chain Id: ${await ethRpc.getChainId()}`);
  console.log(`ETH balance of ${acc1}: ${fromBaseUnits(await ethRpc.getBalance(acc1), 18, 2)}`);
  console.log('');

  const rollupProcessorAddr = EthAddress.fromString('0xFF1F2B4ADb9dF6FC8eAFecDcbF96A2B351680455');
  // Demonstrate a failed tx receipt has a useful error message.
  {
    const contract = new RollupProcessorContract(ethRpc, rollupProcessorAddr, { from: acc1, gas: 1000000 });

    // First we can do a call that will fail (or estimateGas). This will throw.
    try {
      await contract.methods.processRollup(Buffer.alloc(0), Buffer.alloc(0)).call();
    } catch (err: any) {
      console.log(`Call failed (expectedly) on RollupProcessor with: ${err.message}`);
    }

    const receipt = await contract.methods.processRollup(Buffer.alloc(0), Buffer.alloc(0)).send().getReceipt();
    if (receipt.error) {
      console.log(`Send receipt shows failure (expectedly) on RollupProcessor with: ${receipt.error.message}`);
    }
    console.log('');
  }

  // Get Dai balance of rollup processor.
  // Doesn't really need the DaiContract explicitly to do this, but there are other methods unique to Dai.
  {
    const addr = EthAddress.fromString('0x6B175474E89094C44Da98b954EedeAC495271d0F');
    const contract = new DaiContract(ethRpc, addr);
    const balance = await contract.methods.balanceOf(rollupProcessorAddr).call();
    console.log(`DAI Balance of ${rollupProcessorAddr}: ${fromBaseUnits(balance, 18, 2)}`);
    console.log('');
  }

  // Deploy an ERC20 and do a transfer.
  {
    const contract = new ERC20Mintable(ethRpc, undefined, { from: acc1, gas: 1000000 });
    const symbol = 'AZT';
    await contract.deploy(symbol).send().getReceipt();
    console.log(`Deployed ERC20 with symbol: ${await contract.methods.symbol().call()}`);

    console.log(`Transferring from ${acc1} to ${acc2}`);
    await contract.methods.mint(acc1, toBaseUnits('1000', 18)).send().getReceipt();
    console.log(`Balance of ${acc1}: ${fromBaseUnits(await contract.methods.balanceOf(acc1).call(), 18)}`);

    const receipt = await contract.methods.transfer(acc2, toBaseUnits('0.1', 18)).send().getReceipt();
    const [{ args }] = receipt.events.Transfer;
    if (args) {
      console.log(`Log shows transfer of ${args.value} from ${args.from} to ${args.to}`);
    }
    console.log(`${symbol} balance of ${acc1}: ${fromBaseUnits(await contract.methods.balanceOf(acc1).call(), 18)}`);
    console.log(`${symbol} balance of ${acc2}: ${fromBaseUnits(await contract.methods.balanceOf(acc2).call(), 18)}`);
    console.log('');
  }

  signMessage(wallet.accounts[0]);

  /*
  // Create an account, encrypt and decrypt.
  const password = 'mypassword';
  const account = Account.create();
  const keystore = await account.encrypt(password);
  const decryptedAccount = await Account.fromKeystore(keystore, password);

  // Add the account to the wallet, create another 2.
  const wallet = new Wallet();
  wallet.add(decryptedAccount);
  wallet.create(2);

  // If you want eth to use your accounts for signing transaction, set the wallet.
  eth.wallet = wallet;

  // Optionally you can specify a default 'from' address.
  eth.defaultFromAddress = account.address;

  const encryptedWallet = await wallet.encrypt(password);
  const decryptedWallet = await Wallet.fromKeystores(encryptedWallet, password);

  console.log(`Decrypted wallet has ${decryptedWallet.length} accounts.`);
  const signingAccount = decryptedWallet.get(2)!;

  */
}

/**
 * Demonstrates signing a message and verifying signer.
 */
function signMessage(signingAccount: EthAccount) {
  // Sign a message.
  console.log(`Signing message with address: ${signingAccount.address}`);
  const msg = Buffer.from('My signed text');
  const messageHash = hashMessage(msg);
  const sig = sign(messageHash, signingAccount.privateKey);

  // Verify message was signed by account.
  const address = recover(messageHash, sig.signature);
  if (address.equals(signingAccount.address)) {
    console.log(`Message was signed by: ${address}`);
  } else {
    console.error(`Incorrect signature for message ${address}.`);
  }
  console.log('');
}

main().catch(console.error);
