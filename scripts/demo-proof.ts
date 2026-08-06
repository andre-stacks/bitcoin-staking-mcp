import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createBitcoinStakingMcpServer } from "../src/mcp/server.js";

const nativeProfile = {
  goal: "earn_yield",
  liquidityNeed: "lock_until_maturity",
  bitcoinPathPreference: "bitcoin_l1_only",
  keyControlPreference: "self_controlled",
  walletOrCustodian: "Leather",
  amountSats: "100000000",
  timeHorizonDays: 180,
} as const;

const liquidityProfile = {
  goal: "borrow_without_selling",
  liquidityNeed: "access_anytime",
  bitcoinPathPreference: "bitcoin_l1_only",
  keyControlPreference: "self_controlled",
  amountSats: "100000000",
} as const;

function section(title: string, value: unknown) {
  process.stdout.write(`\n=== ${title} ===\n${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const server = createBitcoinStakingMcpServer();
  const client = new Client(
    { name: "bitcoin-staking-demo-proof", version: "0.1.0" },
    { capabilities: {}, versionNegotiation: { mode: "legacy" } },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
    return result.structuredContent as Record<string, unknown>;
  };

  try {
    const mainnetStatus = await call("get_protocol_status", { network: "mainnet" });
    const mainnetBonds = await call("list_protocol_bonds", { network: "mainnet" });
    section("1. LIVE MAINNET STATUS", {
      contractId: mainnetStatus.contractId,
      burnHeight: mainnetStatus.currentBurnchainBlockHeight,
      currentCycle: mainnetStatus.currentCycle,
      verifiedAt: mainnetStatus.verifiedAt,
      sources: mainnetStatus.sources,
    });
    section("2. LIVE MAINNET PROTOCOL BONDS", {
      scannedBondIndices: mainnetBonds.scannedBondIndices,
      bonds: mainnetBonds.bonds,
      assumptions: mainnetBonds.assumptions,
    });

    const testnetDiligence = await call("build_diligence_report", {
      network: "testnet",
      profile: nativeProfile,
    });
    section("3. LIVE POX-5 TESTNET DILIGENCE", {
      bottomLine: testnetDiligence.bottomLine,
      assessmentStatus: testnetDiligence.assessmentStatus,
      availability: testnetDiligence.availability,
      selectedBond: testnetDiligence.selectedBond,
      economics: testnetDiligence.economics,
      materialRisks: testnetDiligence.materialRisks,
      nextDiligenceSteps: testnetDiligence.nextDiligenceSteps,
      verifiedAt: testnetDiligence.verifiedAt,
      sources: testnetDiligence.sources,
    });

    const security = await call("get_security_guidance", { topic: "all" });
    section("4. SECURITY EVIDENCE BOUNDARIES", {
      entries: security.entries,
      assumptions: security.assumptions,
    });

    const demoList = await call("list_bonds", { includeDemo: true });
    const demoBond = (demoList.demoBonds as Array<{ id: string }>)[0];
    if (!demoBond) throw new Error("No demo bond was returned.");
    const [nativePlan, yieldScenario, liquidityPlan] = await Promise.all([
      call("build_participation_plan", { bondId: demoBond.id, profile: nativeProfile }),
      call("simulate_yield", { bondId: demoBond.id, principalSats: "100000000" }),
      call("build_participation_plan", { bondId: demoBond.id, profile: liquidityProfile }),
    ]);
    section("5. EXPLICITLY LABELED DEMO FALLBACK", {
      disclosure: "Synthetic hackathon data; not live, published, or investable.",
      bondId: demoBond.id,
      nativePlan,
      yieldScenario,
    });
    section("6. LIQUIDITY AND BORROWING NO-MATCH", liquidityPlan);

    const tools = await client.listTools();
    section("7. REUSABLE MCP PRIMITIVE", {
      toolCount: tools.tools.length,
      tools: tools.tools.map((tool) => ({ name: tool.name, annotations: tool.annotations })),
    });
  } finally {
    await client.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
