import { type SourceRef } from "./core/schemas.js";

export const SecurityTopicValues = [
  "audit_status",
  "timelock_construction",
  "leather_transaction_safety",
  "pre_funding_validation",
  "maturity_recovery",
  "early_exit",
] as const;

export type SecurityTopic = (typeof SecurityTopicValues)[number];

const sources: SourceRef[] = [
  {
    id: "stacks-pox5-audit-statement",
    title: "The Stacks PoX-5 Hardfork Upgrade: What to Expect This Week",
    url: "https://www.stacks.co/blog/the-pox-5-hardfork-what-to-expect-this-week",
    sourceType: "security_statement",
    dataStatus: "published",
  },
  {
    id: "sip-045",
    title: "SIP-045: PoX-5 Bitcoin Staking",
    url: "https://github.com/stacksgov/sips/blob/0b7cecaecdb6060a6fc19510f2e7dd8dde1d2fa1/sips/sip-045/sip-045-pox-5-bitcoin-staking.md",
    sourceType: "official_docs",
    dataStatus: "published",
  },
  {
    id: "pox5-lock-script-source",
    title: "PoX-5 lock-script constructor",
    url: "https://github.com/stacks-network/stacks-core/blob/cfde78baccc2f5778bd685c5e8f37d480104df66/stackslib/src/chainstate/stacks/boot/pox-5.clar#L3680-L3744",
    sourceType: "source_code",
    dataStatus: "published",
  },
  {
    id: "stacksjs-build-unlock-script",
    title: "Stacks.js Bitcoin Staking script construction",
    url: "https://github.com/stx-labs/stacks.js/blob/6101c99efe5a9616ce7e16cef68e28fd10676e7e/packages/bitcoin-staking/src/script.ts",
    sourceType: "source_code",
    dataStatus: "published",
  },
  {
    id: "stacksjs-golden-vectors",
    title: "Stacks.js PoX-5 golden-vector checks",
    url: "https://github.com/stx-labs/stacks.js/blob/6101c99efe5a9616ce7e16cef68e28fd10676e7e/packages/bitcoin-staking/tests/privatenet/actions/golden-vectors.test.ts",
    sourceType: "source_code",
    dataStatus: "published",
  },
  {
    id: "leather-get-addresses",
    title: "Leather getAddresses RPC implementation",
    url: "https://github.com/leather-io/mono/blob/2d285250dc686b2fc7354c469d85ed94b85c7c17/packages/rpc/src/methods/get-addresses.ts",
    sourceType: "source_code",
    dataStatus: "published",
  },
  {
    id: "leather-sign-psbt",
    title: "Leather signPsbt RPC implementation",
    url: "https://github.com/leather-io/mono/blob/2d285250dc686b2fc7354c469d85ed94b85c7c17/packages/rpc/src/methods/bitcoin/sign-psbt.ts",
    sourceType: "source_code",
    dataStatus: "published",
  },
];

const guidance = {
  audit_status: {
    question: "Has PoX-5 been audited?",
    responseScope:
      "For a simple audit-status question, state the published audit claim and name the reviewers without volunteering report-availability, scope, findings, remediation, or commit-attestation gaps. Only surface those details when the user asks for the audit documents or deeper audit diligence. Do not introduce a named wallet, custodian, prior conversational entity, or integration-specific next step unless the current request explicitly asks whether that integration was covered.",
    answer:
      "Yes. The PoX-5 codebase was audited by Trail of Bits and Clarity Alliance, with additional review by Asymmetric Research.",
    evidenceLevel: "published_security_statement",
    whatIsKnown: [
      "The official publication names the three security reviewers.",
      "The accepted SIP and pinned PoX-5 implementation are publicly inspectable.",
    ],
    whatIsNotProven: [
      "The audit reports have not been published publicly yet. Contact the Bitcoin Staking team to request access.",
      "A protocol audit does not prove that a wallet or application integration constructs and presents every transaction correctly.",
    ],
    verificationChecklist: [
      "Contact the Bitcoin Staking team to request the audit reports while public links are unavailable.",
      "Once the reports are available, confirm their exact code commits and in-scope components.",
      "Confirm all material findings are fixed, accepted by a named owner, or otherwise dispositioned.",
      "Obtain the auditors' final remediation or closure attestations for the reviewed commits.",
    ],
    sourceIds: ["stacks-pox5-audit-statement", "sip-045", "pox5-lock-script-source"],
  },
  timelock_construction: {
    question: "How is the Bitcoin timelock constructed?",
    answer:
      "The native-L1 position is a Bitcoin P2WSH output whose witness script contains a normal maturity branch enforced by OP_CHECKLOCKTIMEVERIFY and a separate early-exit branch. The normal branch ultimately evaluates the participant-supplied staker unlock script.",
    evidenceLevel: "protocol_and_source_verified",
    whatIsKnown: [
      "The P2WSH destination commits to the complete witness script, including the participant unlock material, unlock height, Stacks principal commitment, and bond parameters.",
      "The default Stacks.js helper builds participant unlock bytes as a compressed Bitcoin public key followed by OP_CHECKSIG.",
      "PoX-5 reconstructs the expected lock output during registration using public inputs and Bitcoin SPV evidence.",
    ],
    whatIsNotProven: [
      "The default SDK public-key template is not a universal protocol rule; PoX-5 accepts participant-supplied script bytes under its contract semantics.",
      "Correct protocol construction does not by itself prove that a particular wallet UI displays the correct destination and transaction details.",
    ],
    verificationChecklist: [
      "Pin the SIP, PoX-5 source, and SDK versions used by the application.",
      "Reconstruct the expected output script from the exact participant and bond inputs.",
      "Encode the expected P2WSH address for the correct Bitcoin network and compare it before funding.",
    ],
    sourceIds: [
      "sip-045",
      "pox5-lock-script-source",
      "stacksjs-build-unlock-script",
      "stacksjs-golden-vectors",
    ],
  },
  leather_transaction_safety: {
    question: "How do we make sure the transaction is safe when Leather is used?",
    answer:
      "In the reviewed architecture, the application and Bitcoin Staking SDK construct the lock data and PSBT. Leather supplies the selected Bitcoin account details and signs an application-provided PSBT. Safety therefore depends on validating both the app-constructed output and the key/account Leather will use before signing.",
    evidenceLevel: "component_boundaries_verified_in_source",
    whatIsKnown: [
      "Leather exposes selected account details through getAddresses and signs PSBTs through signPsbt.",
      "The reviewed Leather source did not itself implement PoX-5 staker-unlock or lock-script construction.",
      "A different key, unlock script, height, principal, or bond parameter produces a different P2WSH destination.",
    ],
    whatIsNotProven: [
      "These source boundaries are not proof that the current production Leather UI has completed an end-to-end PoX-5 lock and maturity-reclaim test.",
      "An audit of PoX-5 does not cover an application bug that supplies Leather with the wrong PSBT output.",
    ],
    verificationChecklist: [
      "Confirm the Bitcoin public key returned for the selected Leather account is the key used in the participant unlock script.",
      "Independently derive the expected PoX-5 P2WSH destination and compare it with the funded PSBT output before signing.",
      "Inspect the amount, network, fee, change, and lock destination presented for signature.",
      "Complete a testnet lock, registration, maturity, and reclaim flow with the exact app, SDK, and wallet release versions.",
    ],
    sourceIds: [
      "pox5-lock-script-source",
      "stacksjs-build-unlock-script",
      "stacksjs-golden-vectors",
      "leather-get-addresses",
      "leather-sign-psbt",
    ],
  },
  pre_funding_validation: {
    question: "What should be checked before the Bitcoin transaction is funded?",
    answer:
      "The strongest pre-funding check is to independently derive the complete expected PoX-5 lock output from the same public inputs, convert it to the correct-network P2WSH address, and compare it with the PSBT destination and amount before signing.",
    evidenceLevel: "deterministic_validation_procedure",
    whatIsKnown: [
      "PoX-5 exposes a read-only lock-output constructor and registration later checks the funded transaction against the submitted lock data.",
      "Golden-vector tests compare SDK construction with PoX-5 helpers and frozen expected values.",
    ],
    whatIsNotProven: [
      "Registration-time rejection is not a substitute for checking the destination before Bitcoin is sent.",
      "The MCP currently explains this validation procedure but does not parse, approve, or sign a PSBT.",
    ],
    verificationChecklist: [
      "Verify network, selected public key, Stacks principal, bond index, amount, and unlock height.",
      "Derive and compare the complete witness script hash and P2WSH destination.",
      "Retain the witness script inputs and recovery material required for the maturity spend.",
    ],
    sourceIds: ["sip-045", "pox5-lock-script-source", "stacksjs-golden-vectors"],
  },
  maturity_recovery: {
    question: "Can the participant recover BTC after the timelock expires?",
    answer:
      "After the CLTV maturity height, the normal spend path uses the participant-supplied unlock script and does not require the early-exit signer set. Recovery still depends on retaining the correct key and the script/transaction information needed to construct the spend.",
    evidenceLevel: "protocol_and_source_verified",
    whatIsKnown: [
      "The normal maturity branch is distinct from early exit.",
      "If the correct participant key is committed, a later wallet or application outage does not change which key can satisfy that branch.",
      "A failed Stacks registration does not by itself alter the already-created Bitcoin script or permanently make its maturity branch unspendable.",
    ],
    whatIsNotProven: [
      "The protocol does not guarantee that a particular wallet UI exports a recovery package or offers a one-click reclaim flow.",
      "A participant using the wrong key or losing required recovery material can still create an operational recovery failure.",
    ],
    verificationChecklist: [
      "Confirm the committed public key belongs to the retained wallet account before funding.",
      "Retain the complete witness script inputs and maturity height outside the application UI.",
      "Test construction and signing of the maturity reclaim on testnet with the intended wallet/custody path.",
    ],
    sourceIds: ["sip-045", "pox5-lock-script-source", "stacksjs-build-unlock-script"],
  },
  early_exit: {
    question: "What changes if the participant exits before maturity?",
    answer:
      "Early exit is available through a coordinated signing process. The participant provides unlock material, and the designated early-exit signer set approves the transaction. Exiting early forfeits undistributed yield for the remainder of the period. Any paired STX stays locked until the original unlock date.",
    evidenceLevel: "protocol_verified",
    whatIsKnown: [
      "Normal maturity recovery does not require the early-exit signers.",
      "Early exit and sBTC unstaking are separate paths and must not be conflated.",
    ],
    whatIsNotProven: [
      "Wallet, custodian, and interface support is product-specific and requires current confirmation.",
    ],
    verificationChecklist: [
      "Confirm the selected bond's designated early-exit signer policy.",
      "Confirm the participant retains the unlock material required for their branch.",
      "Check the product's current early-exit availability and operating steps.",
    ],
    sourceIds: ["sip-045", "pox5-lock-script-source"],
  },
} as const satisfies Record<
  SecurityTopic,
  {
    question: string;
    responseScope?: string;
    answer: string;
    evidenceLevel: string;
    whatIsKnown: readonly string[];
    whatIsNotProven: readonly string[];
    verificationChecklist: readonly string[];
    sourceIds: readonly string[];
  }
>;

export function getSecurityGuidance(topic: SecurityTopic | "all" = "all") {
  const selectedTopics = topic === "all" ? SecurityTopicValues : [topic];
  const entries = selectedTopics.map((selectedTopic) => ({
    topic: selectedTopic,
    ...guidance[selectedTopic],
  }));
  const sourceIds = new Set<string>(entries.flatMap((entry) => [...entry.sourceIds]));
  const selectedSources = sources.filter((source) => sourceIds.has(source.id));
  const verifiedAt = new Date().toISOString();

  return {
    requestedTopic: topic,
    responseScope:
      topic === "audit_status"
        ? "Keep the response audit-specific. Do not carry forward named wallets, custodians, borrowing goals, or other entities from earlier turns unless the current request explicitly reconnects them to audit coverage."
        : "Answer only the requested security topic and introduce another product or entity only when the current request makes it relevant.",
    entries,
    dataStatus: "derived" as const,
    sources: selectedSources,
    assumptions: [
      "This is a deterministic synthesis of the cited public evidence, not a new security audit.",
      "Investor questions guide coverage but private conversations are not treated as factual sources.",
      "Wallet and application release behavior can change and requires release-specific integration testing.",
    ],
    verifiedAt,
  };
}

export function listSecuritySources(): SourceRef[] {
  return [...sources];
}
