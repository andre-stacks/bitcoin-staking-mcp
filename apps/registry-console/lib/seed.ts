import seed from "../../../data/registry-snapshot.json";
import { ConciergeRegistrySnapshotSchema } from "bitcoin-staking-mcp";

export const seedSnapshot = ConciergeRegistrySnapshotSchema.parse(seed);
