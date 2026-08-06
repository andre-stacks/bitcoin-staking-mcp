import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CustodyRegistrySchema, type CustodyPathStatus, type SourceRef } from "../core/schemas.js";
import { VersionedRegistryClient } from "./versioned-registry.js";

function defaultPath(): string { const here = dirname(fileURLToPath(import.meta.url)); return [resolve(here, "../../data/custody-paths.json"), resolve(here, "../data/custody-paths.json")].find(existsSync) ?? resolve(here, "../../data/custody-paths.json"); }

export class CustodyStore {
  private readonly client: VersionedRegistryClient<ReturnType<typeof CustodyRegistrySchema.parse>>;
  constructor(path = process.env.BITCOIN_STAKING_CUSTODY_REGISTRY_PATH ?? defaultPath(), options: { now?: () => Date; fetchImpl?: typeof fetch } = {}) {
    this.client = new VersionedRegistryClient({
      remoteUrl: process.env.BITCOIN_STAKING_CUSTODY_REGISTRY_URL ?? "https://raw.githubusercontent.com/andre-stacks/bitcoin-staking-mcp/main/data/custody-paths.json",
      fallbackPath: path, parse: (value) => CustodyRegistrySchema.parse(value),
      ...(options.now ? { now: options.now } : {}), ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }
  async read() { return (await this.client.read()).value; }
  async readWithMetadata() { const result = await this.client.read(); return { registry: result.value, metadata: result.metadata }; }
  async list(input: { provider?: string; status?: CustodyPathStatus } = {}) { const { registry, metadata } = await this.readWithMetadata(); const provider = input.provider?.trim().toLowerCase(); const paths = registry.paths.filter((path) => (!provider || path.id.toLowerCase() === provider || path.name.toLowerCase() === provider) && (!input.status || path.status === input.status)); return { registry, paths, metadata }; }
  async sources(): Promise<SourceRef[]> { return (await this.read()).sources; }
}
