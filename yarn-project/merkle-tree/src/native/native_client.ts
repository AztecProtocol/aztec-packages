import { createDebugLogger } from "@aztec/foundation/log";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

export type NativeWorldStateConfig = {
  worldStateBinaryPath: string;
}

class NativeTrees {
  constructor(private childProcess: ChildProcessWithoutNullStreams) {

  }
  public static init(config: NativeWorldStateConfig, logger = createDebugLogger('aztec:native_client')) {   

    const child = spawn(config.worldStateBinaryPath);
    console.log(`${new Date()} : CHILD STARTED`);
    child.stdout.on("data", (d) => console.log(`${new Date()} : STDOUT => ${d}`));
    child.stderr.on("data", (d) => console.log(`${new Date()} : STDERR => ${d}`));
    child.on("close", () => console.log(`${new Date()} : CHILD ENDED`));
    return new NativeTrees(child);
  }
}