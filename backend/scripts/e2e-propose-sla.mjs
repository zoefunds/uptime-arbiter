import "dotenv/config";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { createAccount, generatePrivateKey } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) {
  console.error("Set NEXT_PUBLIC_CONTRACT_ADDRESS (see .env) before running this script.");
  process.exit(1);
}

const providerKey = generatePrivateKey();
const providerAccount = createAccount(providerKey);
const customerKey = generatePrivateKey();
const customerAccount = createAccount(customerKey);

console.log("Provider address:", providerAccount.address);
console.log("Customer address:", customerAccount.address);
console.log("(private keys generated fresh for this test, not reused elsewhere)");

const readClient = createClient({ chain: studionet });

console.log("\n--- protocol_config (confirming new bounds are live) ---");
const config = await readClient.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_protocol_config",
});
console.log(JSON.stringify(config, null, 2));

console.log("\n--- protocol_stats (confirming clean slate) ---");
const stats = await readClient.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_protocol_stats",
});
console.log(JSON.stringify(stats, null, 2));

const providerClient = createClient({
  chain: studionet,
  account: providerAccount,
});

const label = "Checkout Payments API (eu-west-1)";
const coveredService = "Checkout API — payments-eu-west cluster";
const targetUptimeBps = 9990; // 99.90%
const termSeconds = 30 * 24 * 3600; // 30 days
const evidenceSources = [
  "https://www.githubstatus.com/api/v2/summary.json",
  "https://status.openai.com/api/v2/summary.json",
  "https://status.aws.amazon.com/rss/ec2-us-east-1.rss",
];
const exclusionTerms =
  "Pre-announced scheduled maintenance windows, disclosed at least 24 hours in advance via the provider's status page, do not count toward breach minutes.";

console.log("\n--- calling propose_sla live on StudioNet ---");
console.log("target_uptime_bps:", targetUptimeBps, "term_seconds:", termSeconds);
const expectedGraceMinutes = Math.floor(
  (Math.floor(termSeconds / 60) * (10000 - targetUptimeBps)) / 10000,
);
console.log("expected derived grace_minutes:", expectedGraceMinutes);

const txId = await providerClient.writeContract({
  address: CONTRACT_ADDRESS,
  functionName: "propose_sla",
  args: [
    customerAccount.address,
    label,
    coveredService,
    targetUptimeBps,
    String(250n * 10n ** 18n), // penalty_rate_wei_per_min = 250 GEN/min
    String(50000n * 10n ** 18n), // escrow_wei = 50,000 GEN
    String(5000n * 10n ** 18n), // bond_wei = 5,000 GEN
    String(2500n * 10n ** 18n), // challenge_bond_wei = 2,500 GEN
    2, // tolerance_minutes
    72 * 3600, // challenge_window_seconds
    termSeconds,
    7 * 24 * 3600, // registration_ttl_seconds
    evidenceSources,
    exclusionTerms,
  ],
  value: 0n,
});
console.log("txId:", txId);

console.log("\n--- waiting for ACCEPTED ---");
const receipt = await providerClient.waitForTransactionReceipt({
  hash: txId,
  status: TransactionStatus.ACCEPTED,
  interval: 2500,
  retries: 80,
});
console.log("receipt status:", receipt.status);
console.log("receipt result:", JSON.stringify(receipt.result ?? receipt, null, 2).slice(0, 2000));

console.log("\n--- reading back get_sla(SLA-1) ---");
const sla = await readClient.readContract({
  address: CONTRACT_ADDRESS,
  functionName: "get_sla",
  args: ["SLA-1"],
});
console.log(JSON.stringify(sla, null, 2));

console.log("\n--- verification ---");
console.log("covered_service matches:", sla.covered_service === coveredService);
console.log("grace_minutes matches derived formula:", Number(sla.grace_minutes) === expectedGraceMinutes);
console.log("status is PROPOSED:", sla.status === "PROPOSED");
