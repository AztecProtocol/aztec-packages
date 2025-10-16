import type { AztecAddress } from '@aztec/aztec.js';
import { getAddressFromPrivateKey } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { EthPrivateKey } from '@aztec/node-keystore';

import { writeFile } from 'fs/promises';
import { createServer } from 'http';
import { signMessage, signTypedData } from 'viem/accounts';

// Create a mock JSON RPC signer
// Only supports signing messages and type data

const SUPPORTED_METHODS = ['eth_sign', 'eth_signTypedData_v4'];

export function createJSONRPCSigner(keyLookup: Map<string, EthPrivateKey>, stats: Map<string, number>) {
  return createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const jsonRequest = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });

          if (!SUPPORTED_METHODS.includes(jsonRequest.method)) {
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: jsonRequest.id,
                error: { code: -32601, message: 'Method not supported' },
              }),
            );
            return;
          }

          // Get the address sending the transaction
          const [address, data] = jsonRequest.params;

          const lowerCaseAddress = address.toLowerCase();
          stats.set(lowerCaseAddress, (stats.get(lowerCaseAddress) ?? 0) + 1);

          // Find the private key for the address
          const privateKey = keyLookup.get(address.toLowerCase());
          if (!privateKey) {
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: jsonRequest.id,
                error: { code: -32602, message: `No private key found for address ${address}` },
              }),
            );
            return;
          }

          const promise =
            jsonRequest.method === 'eth_sign'
              ? signMessage({ message: { raw: data as `0x${string}` }, privateKey })
              : signTypedData({
                  privateKey,
                  ...data,
                });

          void promise.then(signature => {
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: jsonRequest.id,
                result: signature,
              }),
            );
          });
        } catch (err) {
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -32603, message: `${err}` },
            }),
          );
        }
      });
    } else {
      res.writeHead(405);
      res.end('Method not allowed');
    }
  });
}

// Functions for creating file based key stores for the e2e_multi_validator_node_key_store test
export async function createKeyFile1(
  fileName: string,
  mnemonic: string,
  validatorIndex: number,
  publisher1Key: EthPrivateKey,
  publisher2Key: EthPrivateKey,
  coinbase: EthAddress,
  feeRecipient: AztecAddress,
) {
  const obj = {
    schemaVersion: 1,
    validators: [
      {
        attester: {
          mnemonic: mnemonic,
          accountIndex: 0,
          addressIndex: validatorIndex,
          addressCount: 1,
        },
        coinbase: coinbase.toChecksumString(),
        publisher: [publisher1Key, publisher2Key],
        feeRecipient: feeRecipient.toString(),
      },
    ],
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export async function createKeyFile2(
  fileName: string,
  validatorKey: EthPrivateKey,
  publisherMnemonic: string,
  publisher1Index: number,
  coinbase: EthAddress,
  feeRecipient: AztecAddress,
) {
  const obj = {
    schemaVersion: 1,
    validators: [
      {
        attester: validatorKey,
        coinbase: coinbase.toChecksumString(),
        publisher: {
          mnemonic: publisherMnemonic,
          accountIndex: 0,
          addressIndex: publisher1Index,
          addressCount: 2,
        },
        feeRecipient: feeRecipient.toString(),
      },
    ],
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export async function createKeyFile3(
  fileName: string,
  validatorAddress: EthAddress,
  publisher1Key: EthPrivateKey,
  publisher2Key: EthPrivateKey,
  coinbase: EthAddress,
  remoteSignerUrl: string,
  feeRecipient: AztecAddress,
) {
  const obj = {
    schemaVersion: 1,
    validators: [
      {
        attester: validatorAddress.toChecksumString(),
        coinbase: coinbase.toChecksumString(),
        publisher: [publisher1Key, publisher2Key],
        feeRecipient: feeRecipient.toString(),
        remoteSigner: {
          remoteSignerUrl: remoteSignerUrl,
        },
      },
    ],
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export async function createKeyFile4(
  fileName: string,
  validator1Address: EthAddress,
  validator2Address: EthAddress,
  publisher1Index: number,
  publisher2Key: EthPrivateKey,
  mnemonic: string,
  publisher3Key: EthPrivateKey,
  coinbase1: EthAddress,
  coinbase2: EthAddress,
  remoteSignerUrl: string,
  feeRecipient1: AztecAddress,
  feeRecipient2: AztecAddress,
) {
  const obj = {
    schemaVersion: 1,
    remoteSigner: {
      remoteSignerUrl: remoteSignerUrl,
    },
    validators: [
      {
        attester: validator1Address.toChecksumString(),
        coinbase: coinbase1.toChecksumString(),
        publisher: {
          mnemonic: mnemonic,
          accountIndex: 0,
          addressIndex: publisher1Index,
          addressCount: 2,
        },
        feeRecipient: feeRecipient1.toString(),
      },
      {
        attester: validator2Address.toChecksumString(),
        coinbase: coinbase2.toChecksumString(),
        publisher: [publisher2Key, publisher3Key],
        feeRecipient: feeRecipient2.toString(),
      },
    ],
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export async function createKeyFile5(fileName: string, proverAddress: EthAddress, remoteSignerUrl: string) {
  const obj = {
    schemaVersion: 1,
    prover: {
      id: '0x1234567890123456789012345678901234567890',
      publisher: [
        {
          address: proverAddress.toChecksumString(),
          remoteSignerUrl: remoteSignerUrl,
        },
      ],
    },
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export async function createKeyFile6(
  fileName: string,
  mnemonic: string,
  validator1Index: number,
  coinbase: EthAddress,
  feeRecipient: AztecAddress,
) {
  const obj = {
    schemaVersion: 1,
    validators: [
      {
        attester: {
          mnemonic: mnemonic,
          accountIndex: 0,
          addressIndex: validator1Index,
          addressCount: 2,
        },
        coinbase: coinbase.toChecksumString(),
        feeRecipient: feeRecipient.toString(),
      },
    ],
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export function addressForPrivateKey(privateKey: EthPrivateKey): EthAddress {
  return EthAddress.fromString(getAddressFromPrivateKey(privateKey));
}
