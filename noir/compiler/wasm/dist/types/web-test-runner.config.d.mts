declare namespace _default {
    let browsers: import("@web/test-runner-playwright").PlaywrightLauncher[];
    let plugins: import("@web/dev-server-core").Plugin[];
    let files: string[];
    let nodeResolve: boolean;
    let rootDir: string;
    let reporters: import("@web/test-runner").Reporter[];
}
export default _default;
