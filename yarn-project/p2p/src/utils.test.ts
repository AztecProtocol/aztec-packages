import { openTmpStore } from "@aztec/kv-store/utils";
import { type P2PConfig } from "./config.js";
import { getPeerIdPrivateKey } from "./util.js";
import { createSecp256k1PeerId } from "@libp2p/peer-id-factory";
import { type AztecKVStore } from "@aztec/kv-store";


describe("p2p utils", () => {

    // Test that peer id private key is persisted within the node store
    describe("getPeerIdPrivateKey", () => {
        const readFromSingleton = async (store: AztecKVStore) => {
            const peerIdPrivateKeySingleton = store.openSingleton("peerIdPrivateKey");
            return await peerIdPrivateKeySingleton.get();
        }

        it("If nothing is provided, it should create a new peer id private key, and persist it", async () => {
            const store = openTmpStore();

            const config = {} as P2PConfig;
            const peerIdPrivateKey = await getPeerIdPrivateKey(config, store);

            expect(peerIdPrivateKey).toBeDefined();

            const storedPeerIdPrivateKey = await readFromSingleton(store);
            expect(storedPeerIdPrivateKey).toBe(peerIdPrivateKey);

            // When we try again, it should read the value from the store, not generate a new one
            const peerIdPrivateKey2 = await getPeerIdPrivateKey(config, store);
            expect(peerIdPrivateKey2).toBe(peerIdPrivateKey);
        });

        it("If a value is provided in the config, it should use and persist that value", async () => {
            const store = openTmpStore();

            const testPeerId = await createSecp256k1PeerId();
            const config = {
                peerIdPrivateKey: testPeerId.privateKey!.toString()
            } as P2PConfig;
            const peerIdPrivateKey = await getPeerIdPrivateKey(config, store);

            expect(peerIdPrivateKey).toBe(testPeerId.privateKey!.toString());

            const storedPeerIdPrivateKey = await readFromSingleton(store);
            expect(storedPeerIdPrivateKey).toBe(testPeerId.privateKey!.toString());

            // Now when given an empty config, it should read the value from the store
            const peerIdPrivateKey2 = await getPeerIdPrivateKey({} as P2PConfig, store);
            expect(peerIdPrivateKey2).toBe(testPeerId.privateKey!.toString());
        });
    });
});

