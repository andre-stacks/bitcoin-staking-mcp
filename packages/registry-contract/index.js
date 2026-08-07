import { z } from "zod";

export const REGISTRY_SCHEMA_VERSION = 3;
export const REGISTRY_REVIEW_CADENCE_DAYS = 7;
export const REGISTRY_EDGE_CONFIG_KEYS = Object.freeze({ published: "publishedSnapshot", draft: "draft", metadata: "publicationMetadata", revisions: "revisionIndex" });
export const RegistryPublicationMetadataSchema = z.object({
  registryVersion: z.string().min(1),
  reviewedAt: z.iso.datetime(),
  reviewCadenceDays: z.literal(REGISTRY_REVIEW_CADENCE_DAYS),
  reviewDueAt: z.iso.datetime(),
  revision: z.string().min(1),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  publishedAt: z.iso.datetime(),
  publishedBy: z.string().email(),
}).strict();
