import { get as getBlob, put } from "@vercel/blob";
import { createClient } from "@vercel/global-config";
import { REGISTRY_EDGE_CONFIG_KEYS } from "@bitcoin-staking/registry-contract";
import type { ConciergeRegistrySnapshot } from "bitcoin-staking-mcp";

export interface RegistryDraft { content: unknown; savedAt: string; savedBy: string }
export interface RevisionEntry { revision: string; contentHash: string; publishedAt: string; publishedBy: string; blobPathname: string }
export interface RegistryState { publishedSnapshot: ConciergeRegistrySnapshot | null; draft: RegistryDraft | null; revisions: RevisionEntry[] }

export interface RegistryBackend {
  readState(): Promise<RegistryState>;
  writeItems(items: Record<string, unknown>): Promise<void>;
  archive(snapshot: ConciergeRegistrySnapshot): Promise<string>;
  readRevision(pathname: string): Promise<ConciergeRegistrySnapshot>;
}

const STORAGE_NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
type StorageEnvironment = Readonly<Record<string, string | undefined>>;

export function registryStorageNamespace(env: StorageEnvironment = process.env): string {
  const configured = env.REGISTRY_STORAGE_NAMESPACE?.trim();
  if (configured) {
    if (!STORAGE_NAMESPACE_PATTERN.test(configured)) {
      throw new Error("REGISTRY_STORAGE_NAMESPACE must use 1-63 lowercase letters, numbers, underscores, or hyphens.");
    }
    return configured;
  }

  const vercelEnvironment = env.VERCEL_ENV?.trim();
  return vercelEnvironment && vercelEnvironment !== "production" ? vercelEnvironment : "";
}

export function registryConfigKey(key: string, env: StorageEnvironment = process.env): string {
  const namespace = registryStorageNamespace(env);
  return namespace ? `${namespace}_${key}` : key;
}

export function registryRevisionPath(revision: string, env: StorageEnvironment = process.env): string {
  const namespace = registryStorageNamespace(env);
  return `${namespace ? `${namespace}/` : ""}revisions/${revision}.json`;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function requiredConfigValue(currentName: string, legacyName: string): string {
  const value = process.env[currentName] ?? process.env[legacyName];
  if (!value) throw new Error(`${currentName} is required.`);
  return value;
}

export class VercelRegistryBackend implements RegistryBackend {
  private client() { return createClient(requiredConfigValue("GLOBAL_CONFIG", "EDGE_CONFIG")); }

  async readState(): Promise<RegistryState> {
    const client = this.client();
    const [publishedSnapshot, draft, revisions] = await Promise.all([
      client.get<ConciergeRegistrySnapshot>(registryConfigKey(REGISTRY_EDGE_CONFIG_KEYS.published)),
      client.get<RegistryDraft>(registryConfigKey(REGISTRY_EDGE_CONFIG_KEYS.draft)),
      client.get<RevisionEntry[]>(registryConfigKey(REGISTRY_EDGE_CONFIG_KEYS.revisions)),
    ]);
    return { publishedSnapshot: publishedSnapshot ?? null, draft: draft ?? null, revisions: revisions ?? [] };
  }

  async writeItems(items: Record<string, unknown>): Promise<void> {
    const configId = requiredConfigValue("GLOBAL_CONFIG_ID", "EDGE_CONFIG_ID");
    const endpoint = new URL(`https://api.vercel.com/v1/edge-config/${configId}/items`);
    if (process.env.VERCEL_TEAM_ID) endpoint.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { authorization: `Bearer ${required("VERCEL_API_TOKEN")}`, "content-type": "application/json" },
      body: JSON.stringify({ items: Object.entries(items).map(([key, value]) => ({ operation: "upsert", key: registryConfigKey(key), value })) }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Global Config update failed (${response.status}): ${await response.text()}`);
  }

  async archive(snapshot: ConciergeRegistrySnapshot): Promise<string> {
    const pathname = registryRevisionPath(snapshot.revision);
    await put(pathname, JSON.stringify(snapshot), { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "application/json" });
    return pathname;
  }

  async readRevision(pathname: string): Promise<ConciergeRegistrySnapshot> {
    const result = await getBlob(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error(`Revision blob not found: ${pathname}`);
    return await new Response(result.stream).json() as ConciergeRegistrySnapshot;
  }
}

let backend: RegistryBackend | undefined;
export function registryBackend(): RegistryBackend { return backend ??= new VercelRegistryBackend(); }
export function setRegistryBackendForTests(value: RegistryBackend | undefined): void { backend = value; }
