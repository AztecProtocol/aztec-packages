import { GrumpkinPrivateKey } from '@aztec/aztec.js';
import { AccountManager } from '@aztec/aztec.js/account';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';
export declare class PrivateEnv {
    private privateKey;
    private pxeURL;
    pxe: import("@aztec/aztec.js").PXE;
    accountContract: SingleKeyAccountContract;
    account: AccountManager;
    constructor(privateKey: GrumpkinPrivateKey, pxeURL: string);
    getWallet(): Promise<import("@aztec/aztec.js").AccountWalletWithPrivateKey>;
}
export declare const deployerEnv: PrivateEnv;
export declare const filteredInterface: import("@aztec/aztec.js").FunctionArtifact[];
//# sourceMappingURL=config.d.ts.map