export const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload',
};

export const FORBIDDEN_FUNCTIONS = ['process_log', 'sync_notes', 'public_dispatch'];

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

export const FUNCTION_DESCRIPTIONS = {
  // SimpleVoting functions
  constructor: 'Initialize the voting contract with an admin who can end the vote',
  cast_vote: 'Cast a private vote for a candidate without revealing who you voted for',
  end_vote: 'End the voting process and prevent further vote submissions',
  get_vote: 'View the total number of votes for a specific candidate',

  // SimpleToken functions
  mint_privately: 'Create new tokens privately for a specified address',
  mint_publicly: 'Create new tokens publicly for a specified address',
  private_transfer: 'Transfer tokens without revealing the amount or participants',
  public_transfer: 'Transfer tokens publicly where amounts and participants are visible to everyone',
  transfer_from_private_to_public: 'Move tokens from private to public state, revealing them on-chain',
  transfer_from_public_to_private: 'Move tokens from public to private state, hiding them from public view',
  name: 'Get the name of the token',
  symbol: "Get the token's ticker symbol",
  decimals: 'Get the number of decimal places supported by the token',
  public_get_name: 'Get the token name from a public function',
  public_get_symbol: 'Get the token symbol from a public function',
  public_get_decimals: 'Get the token decimals from a public function',
  public_total_supply: 'View the total number of tokens in circulation',
  public_balance_of: 'View the public token balance of a specific address',
  private_balance_of: 'View the private token balance of a specific address',
  burn_public: 'Destroy tokens from a public balance, reducing total supply',
  burn_private: 'Destroy tokens from a private balance, reducing total supply',
  prepare_private_balance_increase: 'Prepare for a private balance increase operation',
  finalize_transfer_to_private: 'Complete a previously initiated transfer to private state',
  finalize_mint_to_private: 'Complete a previously initiated private mint operation',
  cancel_authwit: 'Cancel a previously created authorization witness',
};

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
