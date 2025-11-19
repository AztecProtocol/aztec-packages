import type { EthAddress } from '@aztec/foundation/eth-address';
import { type EthPrivateKey, ethPrivateKeySchema } from '@aztec/node-keystore';

export const defaultBlsPath = 'm/12381/3600/0/0/0';

export function validateBlsPathOptions(options: {
  count?: number;
  publisherCount?: number;
  accountIndex?: number;
  addressIndex?: number;
  blsPath?: string;
  ikm?: string;
}) {
  if (options.blsPath && options.blsPath !== defaultBlsPath) {
    if (
      (options.count && options.count !== 1) ||
      (options.publisherCount && options.publisherCount > 0) ||
      (options.accountIndex && options.accountIndex !== 0) ||
      (options.addressIndex && options.addressIndex !== 0)
    ) {
      throw new Error('--bls-path cannot be used with --count, --publisher-count, --account-index, or --address-index');
    }
  }
}

export function validateStakerOutputOptions(options: {
  stakerOutput?: boolean;
  gseAddress?: EthAddress;
  l1RpcUrls?: string[];
  l1ChainId?: number;
}) {
  if (!options.stakerOutput) {
    return;
  }
  // Required options for staker output
  if (!options.gseAddress) {
    throw new Error('--gse-address is required when using --staker-output');
  }
  if (!options.l1RpcUrls || options.l1RpcUrls.length === 0) {
    throw new Error('--l1-rpc-urls is required when using --staker-output');
  }

  if (options.l1ChainId === undefined) {
    throw new Error('--l1-chain-id is required when using --staker-output');
  }
}

export function validateRemoteSignerOptions(options: { remoteSigner?: string; mnemonic?: string }) {
  if (options.remoteSigner && !options.mnemonic) {
    throw new Error(
      'Using --remote-signer requires a deterministic key source. Provide --mnemonic to derive keys, or omit --remote-signer to write new private keys to keystore.',
    );
  }
}

export function validatePublisherOptions(options: { publishers?: string[]; publisherCount?: number }) {
  if (options.publisherCount && options.publisherCount > 0 && options.publishers && options.publishers.length > 0) {
    throw new Error('--publishers and --publisher-count cannot be used together');
  }

  if (options.publishers && options.publishers.length > 0) {
    // Normalize each private key by adding 0x prefix if missing
    const normalizedKeys: string[] = [];
    for (const key of options.publishers) {
      let privateKey = key.trim();
      if (!privateKey.startsWith('0x')) {
        privateKey = '0x' + privateKey;
      }

      try {
        ethPrivateKeySchema.parse(privateKey);
        normalizedKeys.push(privateKey);
      } catch (error) {
        throw new Error(`Invalid publisher private key: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // Update the options with the normalized keys
    options.publishers = normalizedKeys as EthPrivateKey[];
  }
}
