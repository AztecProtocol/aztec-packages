/**
 * Zod schemas for keystore validation using Aztec's validation functions
 */
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { z } from 'zod';

// Use Aztec's validation functions but return string types to match our TypeScript interfaces
const ethAddressSchema = z.string().refine(EthAddress.isAddress, 'Invalid Ethereum address');
const ethPrivateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid private key (must be 32 bytes with 0x prefix)');
const aztecAddressSchema = z.string().refine(AztecAddress.isAddress, 'Invalid Aztec address');
const urlSchema = z.string().url('Invalid URL');

// Remote signer config schema
const remoteSignerConfigSchema = z.union([
  urlSchema,
  z.object({
    remoteSignerUrl: urlSchema,
    certPath: z.string().nullish(),
    certPass: z.string().nullish(),
  }),
]);

// Remote signer account schema
const remoteSignerAccountSchema = z.union([
  ethAddressSchema,
  z.object({
    address: ethAddressSchema,
    remoteSignerUrl: urlSchema.nullish(),
    certPath: z.string().nullish(),
    certPass: z.string().nullish(),
  }),
]);

// JSON V3 keystore schema
const jsonKeyFileV3Schema = z.object({
  path: z.string(),
  password: z.string().nullish(),
});

// Mnemonic config schema
const mnemonicConfigSchema = z.object({
  mnemonic: z.string().min(1, 'Mnemonic cannot be empty'),
  addressIndex: z.number().int().min(0).default(0),
  accountIndex: z.number().int().min(0).default(0),
  addressCount: z.number().int().min(1).default(1),
  accountCount: z.number().int().min(1).default(1),
});

// EthAccount schema
const ethAccountSchema = z.union([
  ethPrivateKeySchema,
  remoteSignerAccountSchema,
  jsonKeyFileV3Schema,
  mnemonicConfigSchema,
]);

// EthAccounts schema
const ethAccountsSchema = z.union([ethAccountSchema, z.array(ethAccountSchema)]);

// Prover keystore schema
const proverKeyStoreSchema = z.union([
  ethAccountSchema,
  z.object({
    id: ethAddressSchema,
    publisher: ethAccountsSchema,
  }),
]);

// Validator keystore schema
const validatorKeyStoreSchema = z.object({
  attester: ethAccountsSchema,
  coinbase: ethAddressSchema.nullish(),
  publisher: ethAccountsSchema.nullish(),
  feeRecipient: aztecAddressSchema,
  remoteSigner: remoteSignerConfigSchema.nullish(),
});

// Main keystore schema
export const keystoreSchema = z
  .object({
    schemaVersion: z.literal(1),
    validators: z.array(validatorKeyStoreSchema).nullish(),
    slasher: ethAccountsSchema.nullish(),
    remoteSigner: remoteSignerConfigSchema.nullish(),
    prover: proverKeyStoreSchema.nullish(),
  })
  .refine(data => data.validators || data.prover, {
    message: 'Keystore must have at least validators or prover configuration',
    path: ['root'],
  });

export type KeyStoreSchema = z.infer<typeof keystoreSchema>;
