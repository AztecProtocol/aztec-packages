/**
 * Zod schemas for keystore validation using Aztec's validation functions
 */
import { optional, schemas } from '@aztec/foundation/schemas';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { z } from 'zod';

import type { BLSPrivateKey, EthPrivateKey } from './types.js';

// Use Aztec's validation functions but return string types to match our TypeScript interfaces
export const ethPrivateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid private key (must be 32 bytes with 0x prefix)')
  .transform(s => s as EthPrivateKey);
export const blsPrivateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid BLS private key (must be 32 bytes with 0x prefix)')
  .transform(s => s as BLSPrivateKey);
const urlSchema = z.string().url('Invalid URL');

// Remote signer config schema
const remoteSignerConfigSchema = z.union([
  urlSchema,
  z.object({
    remoteSignerUrl: urlSchema,
    certPath: optional(z.string()),
    certPass: optional(z.string()),
  }),
]);

// Remote signer account schema
const remoteSignerAccountSchema = z.union([
  schemas.EthAddress,
  z.object({
    address: schemas.EthAddress,
    remoteSignerUrl: urlSchema,
    certPath: optional(z.string()),
    certPass: optional(z.string()),
  }),
]);

// JSON V3 keystore schema
const jsonKeyFileV3Schema = z.object({
  path: z.string(),
  password: optional(z.string()),
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
const ethAccountSchema = z.union([ethPrivateKeySchema, remoteSignerAccountSchema, jsonKeyFileV3Schema]);

// EthAccounts schema
const ethAccountsSchema = z.union([ethAccountSchema, z.array(ethAccountSchema), mnemonicConfigSchema]);

// BLSAccount schema
const blsAccountSchema = z.union([blsPrivateKeySchema, jsonKeyFileV3Schema]);

// AttesterAccount schema: either EthAccount or { eth: EthAccount, bls?: BLSAccount }
const attesterAccountSchema = z.union([
  ethAccountSchema,
  z.object({
    eth: ethAccountSchema,
    bls: optional(blsAccountSchema),
  }),
]);

// AttesterAccounts schema: AttesterAccount | AttesterAccount[] | MnemonicConfig
const attesterAccountsSchema = z.union([attesterAccountSchema, z.array(attesterAccountSchema), mnemonicConfigSchema]);

// Prover keystore schema
const proverKeyStoreSchema = z.union([
  ethAccountSchema,
  z.object({
    id: schemas.EthAddress,
    publisher: ethAccountsSchema,
  }),
]);

// Validator keystore schema
const validatorKeyStoreSchema = z.object({
  attester: attesterAccountsSchema,
  coinbase: optional(schemas.EthAddress),
  publisher: optional(ethAccountsSchema),
  feeRecipient: AztecAddress.schema,
  remoteSigner: optional(remoteSignerConfigSchema),
  fundingAccount: optional(ethAccountSchema),
});

// Main keystore schema
export const keystoreSchema = z
  .object({
    schemaVersion: z.literal(1),
    validators: optional(z.array(validatorKeyStoreSchema)),
    slasher: optional(ethAccountsSchema),
    remoteSigner: optional(remoteSignerConfigSchema),
    prover: optional(proverKeyStoreSchema),
    fundingAccount: optional(ethAccountSchema),
  })
  .refine(data => data.validators || data.prover, {
    message: 'Keystore must have at least validators or prover configuration',
    path: ['root'],
  });
