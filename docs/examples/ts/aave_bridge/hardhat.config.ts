// docs:start:hardhat_config
import { defineConfig } from "hardhat/config";

export default defineConfig({
  solidity: {
    version: "0.8.30",
    settings: { evmVersion: "prague", optimizer: { enabled: true } },
  },
});
// docs:end:hardhat_config
