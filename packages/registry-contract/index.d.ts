import type { z } from "zod";

export declare const REGISTRY_SCHEMA_VERSION: 3;
export declare const REGISTRY_REVIEW_CADENCE_DAYS: 7;
export declare const REGISTRY_EDGE_CONFIG_KEYS: Readonly<{ published: "publishedSnapshot"; draft: "draft"; metadata: "publicationMetadata"; revisions: "revisionIndex" }>;
export declare const RegistryPublicationMetadataSchema: z.ZodType<{
  registryVersion: string;
  reviewedAt: string;
  reviewCadenceDays: 7;
  reviewDueAt: string;
  revision: string;
  contentHash: string;
  publishedAt: string;
  publishedBy: string;
}>;
