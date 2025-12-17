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
  z
    .object({
      remoteSignerUrl: urlSchema,
      certPath: optional(z.string()),
      certPass: optional(z.string()),
    })
    .strict(),
]);

// Remote signer account schema
const remoteSignerAccountSchema = z.union([
  schemas.EthAddress,
  z
    .object({
      address: schemas.EthAddress,
      remoteSignerUrl: urlSchema,
      certPath: optional(z.string()),
      certPass: optional(z.string()),
    })
    .strict(),
]);

// Encrypted keystore file schema (used for both JSON V3 ETH keys and EIP-2335 BLS keys)
const encryptedKeyFileSchema = z
  .object({
    path: z.string(),
    password: optional(z.string()),
  })
  .strict();

// Mnemonic config schema
const mnemonicConfigSchema = z
  .object({
    mnemonic: z.string().min(1, 'Mnemonic cannot be empty'),
    addressIndex: z.number().int().min(0).default(0),
    accountIndex: z.number().int().min(0).default(0),
    addressCount: z.number().int().min(1).default(1),
    accountCount: z.number().int().min(1).default(1),
  })
  .strict();

// EthAccount schema
const ethAccountSchema = z.union([ethPrivateKeySchema, remoteSignerAccountSchema, encryptedKeyFileSchema]);

// EthAccounts schema
const ethAccountsSchema = z.union([ethAccountSchema, z.array(ethAccountSchema), mnemonicConfigSchema]);

// BLSAccount schema
const blsAccountSchema = z.union([blsPrivateKeySchema, encryptedKeyFileSchema]);

// AttesterAccount schema: either EthAccount or { eth: EthAccount, bls?: BLSAccount }
const attesterAccountSchema = z.union([
  ethAccountSchema,
  z
    .object({
      eth: ethAccountSchema,
      bls: optional(blsAccountSchema),
    })
    .strict(),
]);

// AttesterAccounts schema: AttesterAccount | AttesterAccount[] | MnemonicConfig
const attesterAccountsSchema = z.union([attesterAccountSchema, z.array(attesterAccountSchema), mnemonicConfigSchema]);

// Prover keystore schema
const proverKeyStoreSchema = z.union([
  ethAccountSchema,
  z
    .object({
      id: schemas.EthAddress,
      publisher: ethAccountsSchema,
    })
    .strict(),
]);

// Validator keystore schema for v1 (feeRecipient required)
const validatorKeyStoreSchemaV1 = z
  .object({
    attester: attesterAccountsSchema,
    coinbase: optional(schemas.EthAddress),
    publisher: optional(ethAccountsSchema),
    feeRecipient: AztecAddress.schema,
    remoteSigner: optional(remoteSignerConfigSchema),
    fundingAccount: optional(ethAccountSchema),
  })
  .strict();

// Validator keystore schema for v2 (feeRecipient optional, can fall back to top-level)
const validatorKeyStoreSchemaV2 = z
  .object({
    attester: attesterAccountsSchema,
    coinbase: optional(schemas.EthAddress),
    publisher: optional(ethAccountsSchema),
    feeRecipient: optional(AztecAddress.schema),
    remoteSigner: optional(remoteSignerConfigSchema),
    fundingAccount: optional(ethAccountSchema),
  })
  .strict();

// Schema v1 - original format
const keystoreSchemaV1 = z
  .object({
    schemaVersion: z.literal(1),
    validators: optional(z.array(validatorKeyStoreSchemaV1)),
    slasher: optional(ethAccountsSchema),
    remoteSigner: optional(remoteSignerConfigSchema),
    prover: optional(proverKeyStoreSchema),
    fundingAccount: optional(ethAccountSchema),
  })
  .strict()
  .refine(data => data.validators || data.prover, {
    message: 'Keystore must have at least validators or prover configuration',
    path: ['root'],
  });

// Schema v2 - adds top-level publisher, coinbase, feeRecipient
const keystoreSchemaV2 = z
  .object({
    schemaVersion: z.literal(2),
    validators: optional(z.array(validatorKeyStoreSchemaV2)),
    slasher: optional(ethAccountsSchema),
    remoteSigner: optional(remoteSignerConfigSchema),
    prover: optional(proverKeyStoreSchema),
    fundingAccount: optional(ethAccountSchema),
    publisher: optional(ethAccountsSchema),
    coinbase: optional(schemas.EthAddress),
    feeRecipient: optional(AztecAddress.schema),
  })
  .strict()
  .refine(data => data.validators || data.prover, {
    message: 'Keystore must have at least validators or prover configuration',
    path: ['root'],
  })
  .refine(
    data => {
      // If validators are present, ensure each validator has a feeRecipient or there's a top-level feeRecipient
      if (data.validators) {
        const hasTopLevelFeeRecipient = !!data.feeRecipient;
        const allValidatorsHaveFeeRecipient = data.validators.every(v => v.feeRecipient);
        return hasTopLevelFeeRecipient || allValidatorsHaveFeeRecipient;
      }
      return true;
    },
    {
      message: 'Each validator must have a feeRecipient, or a top-level feeRecipient must be set for all validators',
      path: ['feeRecipient'],
    },
  );

// Main keystore schema - accepts both v1 and v2
export const keystoreSchema = z.union([keystoreSchemaV1, keystoreSchemaV2]);
