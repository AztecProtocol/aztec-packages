import './style.css';
import {
  AztecAddress,
  Fr,
  type Wallet,
  type AccountWallet,
} from '@aztec/aztec.js';
import { EmbeddedWallet } from './embedded-wallet';
import { EasyPrivateVotingContract } from '../artifacts/EasyPrivateVoting';

// DOM Elements
const createAccountButton =
  document.querySelector<HTMLButtonElement>('#create-account')!;
const connectTestAccountButton =
  document.querySelector<HTMLButtonElement>('#connect-test-account')!;
const voteForm = document.querySelector<HTMLFormElement>('.vote-form')!;
const voteButton = document.querySelector<HTMLButtonElement>('#vote-button')!;
const voteInput = document.querySelector<HTMLInputElement>('#vote-input')!;
const accountDisplay =
  document.querySelector<HTMLDivElement>('#account-display')!;
const statusMessage =
  document.querySelector<HTMLDivElement>('#status-message')!;
const voteResults = document.querySelector<HTMLDivElement>('#vote-results')!;
const testAccountNumber = document.querySelector<HTMLSelectElement>('#test-account-number')!;

// Local variables
let wallet: EmbeddedWallet;
let contractAddress = process.env.CONTRACT_ADDRESS;
let deployerAddress = process.env.DEPLOYER_ADDRESS;
let deploymentSalt = process.env.DEPLOYMENT_SALT;
let nodeUrl = process.env.AZTEC_NODE_URL;

// On page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!contractAddress) {
      throw new Error('Missing required environment variables');
    }

    // Initialize the PXE and the wallet
    displayStatusMessage('Connecting to node and initializing wallet...');
    wallet = new EmbeddedWallet(nodeUrl);
    await wallet.initialize();

    // Register voting contract with wallet/PXE
    displayStatusMessage('Registering contracts...');
    await wallet.registerContract(
      EasyPrivateVotingContract.artifact,
      AztecAddress.fromString(deployerAddress),
      Fr.fromString(deploymentSalt),
      [AztecAddress.fromString(deployerAddress)]
    );

    // Get existing account
    displayStatusMessage('Checking for existing account...');
    const account = await wallet.connectExistingAccount();
    await displayAccount();

    // Refresh tally if account exists
    if (account) {
      displayStatusMessage('Updating vote tally...');
      await updateVoteTally(account);
      displayStatusMessage('');
    } else {
      displayStatusMessage('Create a new account to cast a vote.');
    }
  } catch (error) {
    console.error(error);
    displayError(
      error instanceof Error ? error.message : 'An unknown error occurred'
    );
  }
});

// Create a new account
createAccountButton.addEventListener('click', async (e) => {
  e.preventDefault();
  const button = e.target as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Creating account...';

  try {
    displayStatusMessage('Creating account...');
    const account = await wallet.createAccountAndConnect();
    displayAccount();
    displayStatusMessage('');

    await updateVoteTally(account);
  } catch (error) {
    console.error(error);
    displayError(
      error instanceof Error ? error.message : 'An unknown error occurred'
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Create Account';
  }
});

// Connect a test account
// Sandbox comes with some test accounts. This can be used instead of creating new ones
// when building against the Sandbox.
connectTestAccountButton.addEventListener('click', async (e) => {
  e.preventDefault();
  const button = e.target as HTMLButtonElement;
  button.disabled = true;
  button.textContent = 'Connecting test account...';

  try {
    const index = Number(testAccountNumber.value) - 1;
    const testAccount = await wallet.connectTestAccount(index);
    displayAccount();
    await updateVoteTally(testAccount);
  } catch (error) {
    console.error(error);
    displayError(
      error instanceof Error ? error.message : 'An unknown error occurred'
    );
  } finally {
    button.disabled = false;
    button.textContent = 'Connect Test Account';
  }
});

// Cast a vote
voteButton.addEventListener('click', async (e) => {
  e.preventDefault();

  const candidate = Number(voteInput.value);
  if (isNaN(candidate) || candidate < 1 || candidate > 5) {
    displayError('Invalid candidate number');
    return;
  }

  const button = e.target as HTMLButtonElement;
  button.disabled = true;
  voteInput.disabled = true;
  button.textContent = 'Voting...';
  displayStatusMessage('Voting...');

  try {
    const connectedAccount = wallet.getConnectedAccount();
    if (!connectedAccount) {
      throw new Error('No account connected');
    }

    // Prepare contract interaction
    const votingContract = await EasyPrivateVotingContract.at(
      AztecAddress.fromString(contractAddress),
      connectedAccount
    );
    const interaction = votingContract.methods.cast_vote(candidate);

    // Send transaction
    await wallet.sendTransaction(interaction);

    // Update tally
    displayStatusMessage('Updating vote tally...');
    await updateVoteTally(connectedAccount);
    displayStatusMessage('');
  } catch (error) {
    console.error(error);
    displayError(
      error instanceof Error ? error.message : 'An unknown error occurred'
    );
  } finally {
    voteInput.disabled = false;
    button.disabled = false;
    button.textContent = 'Vote';
  }
});

// Update the tally
async function updateVoteTally(account: Wallet) {
  let results: { [key: number]: number } = {};

  displayStatusMessage('Updating vote tally...');

  // Prepare contract interaction
  const votingContract = await EasyPrivateVotingContract.at(
    AztecAddress.fromString(contractAddress),
    account
  );

  await Promise.all(
    Array.from({ length: 5 }, async (_, i) => {
      const interaction = votingContract.methods.get_vote(i + 1);
      const value = await wallet.simulateTransaction(interaction);
      results[i + 1] = value;
    })
  );

  // Display the tally
  displayTally(results);
  displayStatusMessage('');
}

// UI functions

function displayError(message: string) {
  statusMessage.textContent = message;
  statusMessage.classList.add('error');
  statusMessage.style.display = 'block';
}

function displayStatusMessage(message: string) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('error');
  statusMessage.style.display = message ? 'block' : 'none';
}

function displayAccount() {
  const connectedAccount = wallet.getConnectedAccount();
  if (!connectedAccount) {
    createAccountButton.style.display = 'block';
    testAccountNumber.style.display = 'block';
    connectTestAccountButton.style.display = 'block';
    voteForm.style.display = 'none';
    return;
  }

  const address = connectedAccount.getAddress().toString();
  const content = `Account: ${address.slice(0, 6)}...${address.slice(-4)}`;
  accountDisplay.textContent = content;
  createAccountButton.style.display = 'none';
  connectTestAccountButton.style.display = 'none';
  testAccountNumber.style.display = 'none';
  voteForm.style.display = 'block';
}

function displayTally(results: { [key: number]: number }) {
  voteResults.innerHTML = Object.entries(results)
    .map(([key, value]) => `Candidate ${key}: ${value} votes`)
    .join('\n');
}
