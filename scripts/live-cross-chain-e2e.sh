#!/usr/bin/env bash
set -euo pipefail

# Real StudioNet + Base Sepolia integration harness. It intentionally accepts
# encrypted keystore paths, never raw keys, and writes a machine-readable record
# containing only public addresses and transaction hashes.
BASE_RPC="${BASE_RPC:-https://sepolia.base.org}"
BASE_ESCROW="${BASE_ESCROW:-0x9d8A7e19336725E261d2e11aB4171F1748aB0d6d}"
USDC="${USDC:-0x036CbD53842c5426634e7929541eC2318f3dCF7e}"
GEN_CONTRACT="${GEN_CONTRACT:-0x700D935A78562Dd5FBdfA603bbb5E00C9f521D81}"
PROVIDER_KEYSTORE="${PROVIDER_KEYSTORE:?set PROVIDER_KEYSTORE}"
CUSTOMER_KEYSTORE="${CUSTOMER_KEYSTORE:?set CUSTOMER_KEYSTORE}"
KEYSTORE_PASSWORD="${KEYSTORE_PASSWORD:?set KEYSTORE_PASSWORD}"
PROVIDER_GEN_ACCOUNT="${PROVIDER_GEN_ACCOUNT:-uptime-milestone}"
CUSTOMER_GEN_ACCOUNT="${CUSTOMER_GEN_ACCOUNT:-uptime-v4-e2e-customer}"
RESULT_FILE="${RESULT_FILE:-/tmp/uptime-v4-live-e2e.jsonl}"

PROVIDER="$(cast wallet address --keystore "$PROVIDER_KEYSTORE" --password "$KEYSTORE_PASSWORD")"
CUSTOMER="$(cast wallet address --keystore "$CUSTOMER_KEYSTORE" --password "$KEYSTORE_PASSWORD")"
## v0.10's deterministic GitHub Actions evaluator intentionally accepts the
## canonical incident archive only.  It derives payable intervals from the
## incident-update timeline rather than summary/status snapshots.
SOURCES='["https://www.githubstatus.com/api/v2/incidents.json"]'
EXCLUSIONS="Scheduled maintenance is excluded only when GitHub Status identifies it as scheduled and shows it was announced before the observation window."

base_send() {
  local keystore="$1"; shift
  local sender nonce
  sender="$(cast wallet address --keystore "$keystore" --password "$KEYSTORE_PASSWORD")"
  nonce="$(cast nonce "$sender" --block pending --rpc-url "$BASE_RPC")"
  cast send "$@" --rpc-url "$BASE_RPC" --keystore "$keystore" --password "$KEYSTORE_PASSWORD" \
    --nonce "$nonce" --gas-price 10000000 --json | jq -r '.transactionHash'
}

gen_write() {
  local account="$1" method="$2"; shift 2
  genlayer account use "$account" >/dev/null
  local output tx
  output="$(genlayer write "$GEN_CONTRACT" "$method" --args "$@")"
  tx="$(printf '%s\n' "$output" | awk '/Write Transaction Hash:/{getline; print; exit}' | tr -d '[:space:]')"
  if [[ -z "$tx" ]]; then
    printf '%s\n' "$output" >&2
    return 1
  fi
  local receipt_file
  receipt_file="$(mktemp)"
  genlayer receipt "$tx" --status FINALIZED --retries 160 --interval 5000 > "$receipt_file"
  if grep -Eq "status: 'contract_error'" "$receipt_file"; then
    printf 'GenLayer %s execution failed:\n' "$method" >&2
    grep -E "payload:|stderr:|execution_result:|status:" "$receipt_file" >&2 || true
    rm -f "$receipt_file"
    return 1
  fi
  rm -f "$receipt_file"
  printf '%s' "$tx"
}

terms_hash() {
  local escrow="$1" bond="$2" registration="$3" service_end="$4" claim_deadline="$5" settlement_deadline="$6" label="$7"
  local encoded
  encoded="$(cast abi-encode 'f(uint256,address,address,address,uint128,uint128,uint64,uint64,uint64,uint64,uint256,uint256,string,string,string[],string)' \
    84532 "$BASE_ESCROW" "$PROVIDER" "$CUSTOMER" "$escrow" "$bond" "$registration" "$service_end" "$claim_deadline" "$settlement_deadline" \
    9995 1000 "$label" 'GitHub Actions hosted runners (us-east-1)' "$SOURCES" "$EXCLUSIONS")"
  cast keccak "$encoded"
}

SLA_SEQ="${SLA_SEQ:-0}"
setup_scenario() {
  local scenario="$1" registration_offset="$2" service_offset="$3" claim_offset="$4" settlement_offset="$5"
  local now term_start registration service_end claim_deadline settlement_deadline escrow bond label terms agreement
  now="$(date +%s)"; term_start="$((now - 7200))"
  registration="$((now + registration_offset))"; service_end="$((now + service_offset))"
  claim_deadline="$((now + claim_offset))"; settlement_deadline="$((now + settlement_offset))"
  escrow=100000; bond=20000; label="Uptime Arbiter v0.10 live E2E ${scenario}"
  terms="$(terms_hash "$escrow" "$bond" "$registration" "$service_end" "$claim_deadline" "$settlement_deadline" "$label")"
  agreement="$(cast call "$BASE_ESCROW" 'nextAgreementId()(uint256)' --rpc-url "$BASE_RPC")"

  local proposal approval provider_funding customer_approval customer_funding gen_registration gen_customer_ack
  proposal="$(base_send "$PROVIDER_KEYSTORE" "$BASE_ESCROW" 'propose(address,uint128,uint128,uint64,uint64,uint64,uint64,bytes32)' "$CUSTOMER" "$escrow" "$bond" "$registration" "$service_end" "$claim_deadline" "$settlement_deadline" "$terms")"
  approval="$(base_send "$PROVIDER_KEYSTORE" "$USDC" 'approve(address,uint256)(bool)' "$BASE_ESCROW" "$escrow")"
  provider_funding="$(base_send "$PROVIDER_KEYSTORE" "$BASE_ESCROW" 'fundProvider(uint256)' "$agreement")"
  customer_approval="$(base_send "$CUSTOMER_KEYSTORE" "$USDC" 'approve(address,uint256)(bool)' "$BASE_ESCROW" "$bond")"
  customer_funding="$(base_send "$CUSTOMER_KEYSTORE" "$BASE_ESCROW" 'acceptAndFundCustomer(uint256)' "$agreement")"

  gen_registration="$(gen_write "$PROVIDER_GEN_ACCOUNT" register_adjudication "$agreement" "$terms" "$CUSTOMER" "$label" \
    'GitHub Actions hosted runners (us-east-1)' 9995 1000 "$escrow" "$bond" "$term_start" "$service_end" "$claim_deadline" \
    "$settlement_deadline" 300 600 "$SOURCES" "$EXCLUSIONS" "$provider_funding")"
  SLA_SEQ="$((SLA_SEQ + 1))"
  local sla_id="SLA-${SLA_SEQ}"
  gen_customer_ack="$(gen_write "$CUSTOMER_GEN_ACCOUNT" record_base_funding "$sla_id" CUSTOMER "$customer_funding")"

  jq -nc --arg scenario "$scenario" --arg agreement "$agreement" --arg sla "$sla_id" --arg terms "$terms" \
    --arg proposal "$proposal" --arg approval "$approval" --arg providerFunding "$provider_funding" \
    --arg customerApproval "$customer_approval" --arg customerFunding "$customer_funding" \
    --arg genRegistration "$gen_registration" --arg genCustomerAck "$gen_customer_ack" \
    --arg serviceEnd "$service_end" --arg claimDeadline "$claim_deadline" --arg settlementDeadline "$settlement_deadline" \
    '{scenario:$scenario,agreementId:$agreement,slaId:$sla,termsHash:$terms,base:{proposal:$proposal,providerApproval:$approval,providerFunding:$providerFunding,customerApproval:$customerApproval,customerFunding:$customerFunding},genlayer:{registration:$genRegistration,customerFundingAcknowledgment:$genCustomerAck},deadlines:{serviceEnd:$serviceEnd,claimDeadline:$claimDeadline,settlementDeadline:$settlementDeadline}}' | tee -a "$RESULT_FILE"
}

: > "$RESULT_FILE"
genlayer account unlock --account "$CUSTOMER_GEN_ACCOUNT" --password "$KEYSTORE_PASSWORD" >/dev/null
if [[ "${SKIP_PRIMARY:-0}" != "1" ]]; then
  setup_scenario "finalized-no-breach-settlement" 600 3600 7200 14400
fi
setup_scenario "compromised-relay-veto-recovery" 180 300 900 1200
setup_scenario "unclaimed-expiry-recovery" 180 300 900 1200
genlayer account use "$PROVIDER_GEN_ACCOUNT" >/dev/null
printf 'Public transaction manifest: %s\n' "$RESULT_FILE"
