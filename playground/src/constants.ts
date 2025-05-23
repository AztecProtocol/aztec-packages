export const PLAYGROUND_URL = 'https://play.aztec.network/'; // TODO: this should be based on the network
export const DISCORD_URL = 'https://discord.gg/aztec';

export const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload',
};

export const FORBIDDEN_FUNCTIONS = ['process_log', 'sync_private_state', 'public_dispatch'];

export const TX_TIMEOUT = 180;

export const TOKEN_ALLOWED_FUNCTIONS = [
  'mint_privately',
  'mint_publicly',
  'private_transfer',
  'public_transfer',
  'transfer_from_private_to_public',
  'transfer_from_public_to_private',
  'name',
  'symbol',
  'decimals',
  'public_get_name',
  'public_get_symbol',
  'public_get_decimals',
  'public_total_supply',
  'public_balance_of',
  'private_balance_of',
  'burn_public',
  'burn_private',
  'prepare_private_balance_increase',
  'finalize_transfer_to_private',
  'finalize_mint_to_private',
  'cancel_authwit',
];

export const INFO_TEXT = {
  ACCOUNT_ABSTRACTION:
    'Aztec has native Account Abstraction, you can choose the type of signature you want for your account contract. We recommend the ecdsa_r1 signature that you can store on passkeys or do web authentication.',
  ALIASES: "Give friendly names to objects you interact with, so they're easier to find later",
  FEE_ABSTRACTION:
    'Aztec has native Fee Abstraction, so you can choose to pay gas fees in multiple ways. For testnet, we’ve got you covered! Use our Sponsored Fee Payment Contract and your transactions are on us.',
  AUTHWITS:
    'Authorization witnesses (AuthWits) work similarly to permit/approval on Ethereum. They allow execution of functions on behalf of other contracts or addresses.',
  CREATE_CONTRACT:
    "Just like in Ethereum, you can load an existing contract instance (if you know it's ABI and address) or create a new one.",
  CONTACTS: 'Register contacts so you can discover notes sent by them',
};

export const FUN_FACTS = [
  'Aztec has a super cool account abstraction model which you are utilizing right now.',
  "You're generating a client-side proof directly in your browser, and it won't take forever!",
  'Aztec enables programmable privacy across the entire Ethereum ecosystem.',
  'Aztec uses zero-knowledge proofs to enable private transactions.',
  'The Aztec protocol was founded in 2017.',
  // "We're almost there...",
  'Aztec Connect was the first private DeFi application.',
  'Aztec invented PLONK which underpins modern zk proving systems and zkVMs.',
  'Aztec supports private, public, and hybrid smart contract execution.',
  'Aztec enables privacy and full composability across private and public calls.',
  'All Aztec transactions start off private (since account and transaction entrypoints are private).',
  'Aztec is the first L2 to launch a decentralized testnet on day 1.',
  'While you wait for this proof, check out somethinghappened.wtf.',
];
