export interface ParsedArgs {
    files: string[];
    outDir?: string | undefined;
    inputDir?: string | undefined;
}
export declare function parseArgs(): ParsedArgs;
