import { createPublicClient, createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { parseGwei, stringToHex, toBlobs } from 'viem'

import { Blob } from "@aztec/foundation/blob";


describe('temp blob test', () => {

    it('should work', async () => {
        const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        const account = privateKeyToAccount(privateKey);

        const client = createWalletClient({
            account,
            chain: foundry,
            transport: http(),
        });
        const publicClient = createPublicClient({
            chain: foundry,
            transport: http(),
        });


        const blobs = toBlobs({ data: stringToHex('hello world') })

        const hash = await client.sendTransaction({
        blobs,
        kzg: Blob.getViemKzgInstance(),
        maxFeePerBlobGas: parseGwei('30'),
        to: '0x0000000000000000000000000000000000000000',
        })

        console.log(hash);

        const receipt = await publicClient.getTransactionReceipt({ hash });
        console.log(receipt);
    });

});