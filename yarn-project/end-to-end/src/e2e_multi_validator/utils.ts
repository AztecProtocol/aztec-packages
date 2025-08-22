import { getAddressFromPrivateKey } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { EthPrivateKey } from '@aztec/node-keystore';

import { writeFile } from 'fs/promises';
import { createServer } from 'http';
import type { WalletClient } from 'viem';
import { signMessage, signTypedData } from 'viem/accounts';

export type KeyAndWallet = {
  key: EthPrivateKey;
  wallet: WalletClient;
};

export function createJSONRPCSigner(keyLookup: Map<string, KeyAndWallet>) {
  return createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const jsonRequest = JSON.parse(body);

          if (jsonRequest.method === 'eth_sign') {
            const [address, message] = jsonRequest.params;

            // Find the private key for the address
            const wallet = keyLookup.get(address.toLowerCase());
            if (!wallet) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: jsonRequest.id,
                  error: { code: -32602, message: `No private key found for address ${address}` },
                }),
              );
              return;
            }

            // Sign the message
            void signMessage({ message: { raw: message as `0x${string}` }, privateKey: wallet.key }).then(signature => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: jsonRequest.id,
                  result: signature,
                }),
              );
            });
          } else if (jsonRequest.method === 'eth_signTypedData_v4') {
            const [address, typedData] = jsonRequest.params;

            // Find the private key for the address
            const wallet = keyLookup.get(address.toLowerCase());
            if (!wallet) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: jsonRequest.id,
                  error: { code: -32602, message: `No private key found for address ${address}` },
                }),
              );
              return;
            }

            // Sign the typed data
            void signTypedData({
              privateKey: wallet.key,
              ...typedData,
            }).then(signature => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: jsonRequest.id,
                  result: signature,
                }),
              );
            });
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: jsonRequest.id,
                error: { code: -32601, message: 'Method not supported' },
              }),
            );
          }
        } catch (_) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              error: { code: -32603, message: 'Internal error' },
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

export async function createKeyFile1(
  fileName: string,
  mnemonic: string,
  validatorIndex: number,
  publisher1Key: EthPrivateKey,
  publisher2Key: EthPrivateKey,
  coinbase: EthAddress,
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
        feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      },
    ],
  };
  await writeFile(fileName, JSON.stringify(obj, null, 2));
}

export async function createKeyFile2(
  fileName: string,
  validatorKey: EthPrivateKey,
  publisher1Key: EthPrivateKey,
  publisher2Key: EthPrivateKey,
  coinbase: EthAddress,
) {
  const obj = {
    schemaVersion: 1,
    validators: [
      {
        attester: validatorKey,
        coinbase: coinbase.toChecksumString(),
        publisher: [publisher1Key, publisher2Key],
        feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
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
) {
  const obj = {
    schemaVersion: 1,
    validators: [
      {
        attester: {
          address: validatorAddress.toChecksumString(),
        },
        coinbase: coinbase.toChecksumString(),
        publisher: [publisher1Key, publisher2Key],
        feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
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
) {
  const obj = {
    schemaVersion: 1,
    remoteSigner: {
      remoteSignerUrl: remoteSignerUrl,
    },
    validators: [
      {
        attester: {
          address: validator1Address.toChecksumString(),
        },
        coinbase: coinbase1.toChecksumString(),
        publisher: {
          mnemonic: mnemonic,
          accountIndex: 0,
          addressIndex: publisher1Index,
          addressCount: 2,
        },
        feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      },
      {
        attester: {
          address: validator2Address.toChecksumString(),
        },
        coinbase: coinbase2.toChecksumString(),
        publisher: [publisher2Key, publisher3Key],
        feeRecipient: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
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

export function addressForPrivateKey(privateKey: EthPrivateKey): EthAddress {
  return EthAddress.fromString(getAddressFromPrivateKey(privateKey));
}
