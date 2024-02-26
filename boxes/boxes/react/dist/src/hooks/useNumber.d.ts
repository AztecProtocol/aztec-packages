import { Contract } from '@aztec/aztec.js';
export declare function useNumber({ contract }: {
    contract: Contract;
}): {
    getNumber: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    setNumber: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    wait: boolean;
};
//# sourceMappingURL=useNumber.d.ts.map