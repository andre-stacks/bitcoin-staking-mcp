import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  transpilePackages: ["bitcoin-staking-mcp"],
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
};

export default config;
