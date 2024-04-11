import { Fr } from "@aztec/circuits.js";
import { NewTestKeyStore } from "./new_test_key_store.js";
import { openTmpStore } from "@aztec/kv-store/utils";
import { Grumpkin } from "@aztec/circuits.js/barretenberg";

describe('NewTestKeyStore', () => {
  it('Adds account and returns keys', () => {
    const db = openTmpStore();
    const keyStore = new NewTestKeyStore(new Grumpkin(), db);

    // Arbitrary fixed values
    const sk = new Fr(8923n);
    const partialAddress = new Fr(243523n);
    
    const accountAddress = keyStore.addAccount(sk, partialAddress);
    expect(accountAddress).toMatchInlineSnapshot(`"0071f7630d28ce02cc1ca8b15c44953f84a39e1478445395247ae04dfa213c0e"`);
  });
});
