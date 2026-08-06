import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BondManifestSchema, type BondManifest, type SourceRef } from "../core/schemas.js";
import { ServiceError } from "../core/errors.js";

function defaultManifestDirectory(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourceCandidate = resolve(here, "../../data/bonds");
  const builtCandidate = resolve(here, "../../data/bonds");
  const packageCandidate = resolve(here, "../data/bonds");
  return [sourceCandidate, builtCandidate, packageCandidate].find(existsSync) ?? sourceCandidate;
}

export class ManifestStore {
  constructor(private readonly directory = process.env.BITCOIN_STAKING_DATA_DIR ?? defaultManifestDirectory()) {}

  async list(): Promise<BondManifest[]> {
    let names: string[];
    try {
      names = (await readdir(this.directory)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      throw new ServiceError(
        "NOT_FOUND",
        `Bond manifest directory is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const manifests = await Promise.all(
      names.map(async (name) => {
        const raw = await readFile(resolve(this.directory, name), "utf8");
        return BondManifestSchema.parse(JSON.parse(raw));
      }),
    );

    const ids = new Set<string>();
    for (const manifest of manifests) {
      if (ids.has(manifest.id)) {
        throw new ServiceError("INVALID_INPUT", `Duplicate bond manifest ID: ${manifest.id}`);
      }
      ids.add(manifest.id);
    }
    return manifests;
  }

  async get(id: string): Promise<BondManifest> {
    const manifest = (await this.list()).find((candidate) => candidate.id === id);
    if (!manifest) throw new ServiceError("NOT_FOUND", `Bond not found: ${id}`);
    return manifest;
  }

  async sources(): Promise<SourceRef[]> {
    const byId = new Map<string, SourceRef>();
    for (const manifest of await this.list()) {
      for (const source of manifest.sources) byId.set(source.id, source);
    }
    return [...byId.values()];
  }
}
