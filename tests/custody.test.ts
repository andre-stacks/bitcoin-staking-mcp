import assert from "node:assert/strict";
import test from "node:test";
import { CustodyRegistrySchema } from "../src/core/schemas.js";
import { CustodyStore } from "../src/providers/custody-store.js";
import { BitcoinStakingService } from "../src/service.js";

test("custody registry contains the complete current product directory", async () => {
  const registry = CustodyRegistrySchema.parse(await new CustodyStore().read());
  assert.deepEqual(
    registry.paths.map((path) => [path.name, path.status]),
    [
      ["Leather", "available"],
      ["Leather Multi-sig", "available"],
      ["Ledger", "available"],
      ["Fordefi", "available"],
      ["Fireblocks", "available"],
      ["BitGo", "not_currently_supported"],
    ],
  );
});

test("custody directory is product-level, filterable, and freshness-aware", async () => {
  const current = new BitcoinStakingService({
    now: () => new Date("2026-08-10T00:00:00.000Z"),
  });
  const available = await current.listCustodyPaths({ status: "available" });
  assert.equal(available.paths.length, 5);
  assert.equal(available.reviewStatus, "current");
  assert.equal(available.dataStatus, "published");
  assert.ok(available.assumptions.some((assumption) => /native-L1 direct/i.test(assumption)));

  const bitgo = await current.listCustodyPaths({ provider: "BitGo" });
  assert.equal(bitgo.paths[0]?.status, "not_currently_supported");
  assert.match(bitgo.paths[0]?.evidence ?? "", /STX stacking and sBTC support/i);

  const stale = new BitcoinStakingService({
    now: () => new Date("2026-08-14T00:00:00.001Z"),
  });
  const overdue = await stale.listCustodyPaths();
  assert.equal(overdue.reviewStatus, "review_due");
  assert.ok(overdue.paths.every((path) => path.effectiveStatus === "needs_review"));
});
