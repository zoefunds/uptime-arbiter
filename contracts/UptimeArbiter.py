# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import re
import typing
from dataclasses import dataclass
from datetime import datetime, timezone


# ============================================================================
# 1. ERROR CLASSIFICATION
# ============================================================================
# Every rejection raises gl.vm.UserError (never a bare exception — a bare
# exception becomes an unrecoverable VMError and is what produces the
# "could not load contract schema" / undetermined-consensus failure mode).
# Prefixes tell validators HOW to compare two independent failures:
#   [EXPECTED]  deterministic business-rule rejection -> exact string match
#   [EXTERNAL]  deterministic external 4xx             -> exact string match
#   [TRANSIENT] nondeterministic network/5xx failure    -> agree if both hit it
#   [LLM_ERROR] LLM misbehaved / malformed output        -> always disagree,
#                                                            forces leader
#                                                            rotation instead
#                                                            of freezing bad
#                                                            state
ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"


def _fail(message: str) -> typing.NoReturn:
    raise gl.vm.UserError(f"{ERROR_EXPECTED} {message}")


def _require(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


# ============================================================================
# 2. PROTOCOL-LEVEL STATE MACHINE CONSTANTS
# ============================================================================
# SLA lifecycle:
#   PROPOSED -> ACTIVE -> CONCLUDED
#            -> CANCELLED   (either party backs out before both deposits land)
SLA_STATUS_PROPOSED = "PROPOSED"
SLA_STATUS_ACTIVE = "ACTIVE"
SLA_STATUS_CONCLUDED = "CONCLUDED"
SLA_STATUS_CANCELLED = "CANCELLED"

# Claim lifecycle:
#   PINNED -> RESOLVED_BREACH | RESOLVED_PARTIAL | RESOLVED_NO_BREACH | INCONCLUSIVE
#   RESOLVED_* -> (optional challenge round, in place, verdict may flip) -> FINALIZED
CLAIM_STATUS_PINNED = "PINNED"
CLAIM_STATUS_RESOLVED_BREACH = "RESOLVED_BREACH"
CLAIM_STATUS_RESOLVED_PARTIAL = "RESOLVED_PARTIAL"
CLAIM_STATUS_RESOLVED_NO_BREACH = "RESOLVED_NO_BREACH"
CLAIM_STATUS_INCONCLUSIVE = "INCONCLUSIVE"

_CLAIM_RESOLVED_STATUSES = (
    CLAIM_STATUS_RESOLVED_BREACH,
    CLAIM_STATUS_RESOLVED_PARTIAL,
    CLAIM_STATUS_RESOLVED_NO_BREACH,
)

CHALLENGE_OUTCOME_PENDING = "PENDING"
CHALLENGE_OUTCOME_UPHELD_ORIGINAL = "UPHELD_ORIGINAL"
CHALLENGE_OUTCOME_OVERTURNED = "OVERTURNED"
CHALLENGE_OUTCOME_INCONCLUSIVE_RETRY = "INCONCLUSIVE_RETRY"

# Sentinel used inside the nondeterministic pipeline to mean
# "could not derive a breach-minute figure for this source/run".
_INCONCLUSIVE_SENTINEL = -1


# ============================================================================
# 3. PROTOCOL BOUNDS
# ============================================================================
# These bound every user-supplied numeric parameter. They exist to keep the
# contract usable and safe WITHOUT being so strict that ordinary, good-faith
# SLAs get rejected or that minor validator timing/format differences cause
# an undetermined consensus result. Every bound below is deliberately wide.
MIN_EVIDENCE_SOURCES = 3
MAX_EVIDENCE_SOURCES = 8

MIN_TOLERANCE_MINUTES = 0
MAX_TOLERANCE_MINUTES = 30
DEFAULT_TOLERANCE_MINUTES = 2

MIN_CHALLENGE_WINDOW_SECONDS = 24 * 3600         # 24h
MAX_CHALLENGE_WINDOW_SECONDS = 14 * 24 * 3600    # 14 days
DEFAULT_CHALLENGE_WINDOW_SECONDS = 72 * 3600     # 72h

MIN_TERM_SECONDS = 24 * 3600           # 1 day minimum agreement length
MAX_TERM_SECONDS = 366 * 24 * 3600     # ~1 year maximum

MIN_REGISTRATION_TTL_SECONDS = 3600            # 1h minimum to co-sign
MAX_REGISTRATION_TTL_SECONDS = 30 * 24 * 3600  # 30 days maximum
DEFAULT_REGISTRATION_TTL_SECONDS = 7 * 24 * 3600

MIN_PENALTY_RATE_WEI_PER_MIN = 1
MAX_PENALTY_RATE_WEI_PER_MIN = 10_000 * (10 ** 18)  # 10,000 GEN/min ceiling

MIN_ESCROW_WEI = 10 ** 15               # 0.001 GEN floor — blocks zero/dust SLAs
MAX_GRACE_MINUTES = 10_000

MAX_CLAIM_WINDOW_MINUTES = 90 * 24 * 60  # 90 days max claimed window
MIN_CLAIM_WINDOW_MINUTES = 1

MIN_CHALLENGE_BOND_BPS = 500     # challenge bond must be >= 5% of escrow
MAX_ADDITIONAL_SOURCES_PER_CHALLENGE = 2
MAX_CHALLENGE_ROUNDS_PER_CLAIM = 2

BPS_DENOMINATOR = 10_000
MAX_SOURCE_URL_LENGTH = 512
MAX_LABEL_LENGTH = 160
MAX_RATIONALE_LENGTH = 2_000
MAX_FETCH_BODY_CHARS = 6_000  # prompt-size guard when feeding fetched pages to the LLM


# ============================================================================
# 4. STORAGE DATACLASSES
# ============================================================================

@allow_storage
@dataclass
class SLAAgreement:
    sla_id: str
    provider: Address
    customer: Address
    label: str

    target_uptime_bps: u256
    grace_minutes: u256
    penalty_rate_wei_per_min: u256

    escrow_wei: u256            # agreed term
    escrow_deposited: u256      # actual ledger — payout logic reads ONLY this
    bond_wei: u256               # agreed term (customer's registration bond)
    bond_deposited: u256         # actual ledger

    challenge_bond_wei: u256     # fixed GEN required to file a challenge

    tolerance_minutes: u256
    challenge_window_seconds: u256
    term_seconds: u256

    evidence_sources: DynArray[str]   # immutable once ACTIVE
    source_digest: str                 # integrity fingerprint, see _fingerprint()
    adjudicated_windows: DynArray[str] # "start:end" strings already ruled on,
                                        # blocks re-claiming the same downtime

    status: str
    provider_funded: bool
    customer_signed: bool

    created_at: str
    registration_deadline_ts: u256
    term_start_ts: u256
    term_end_ts: u256

    active_claim_id: str   # "" when no claim is currently open on this SLA


@allow_storage
@dataclass
class Claim:
    claim_id: str
    sla_id: str
    claimant: Address

    window_start_ts: u256
    window_end_ts: u256

    pinned_sources: DynArray[str]     # snapshot of sla.evidence_sources at submit time
    pinned_source_digest: str
    submitted_at: str

    status: str
    breach_minutes: u256               # agreed consensus figure (0 if never resolved)
    inconclusive_reason: str

    recommended_payout_bps: u256       # 10000 = 100% of computed payout, for PARTIAL
    payout_wei: u256                    # deterministic settlement output
    resolved_at: str

    challenge_deadline_ts: u256
    challenge_count: u256
    active_challenge_id: str
    is_challenged: bool
    finalized: bool


@allow_storage
@dataclass
class Challenge:
    challenge_id: str
    claim_id: str
    challenger: Address

    additional_sources: DynArray[str]
    rationale: str

    bond_wei: u256
    bond_deposited: u256

    filed_at: str
    resolved: bool
    outcome: str
    resolved_at: str

    prior_breach_minutes: u256
    new_breach_minutes: u256


# ============================================================================
# 5. VALUE-TRANSFER PRIMITIVE (single emission choke point)
# ============================================================================
# Every GEN payout in this contract funnels through `_send_gen`. It is the
# ONLY code path that moves GEN out of the contract. Auditing every place
# money moves is a single grep for this function name. It is only ever
# called from `withdraw()`, after the caller's ledger balance has already
# been read and zeroed.

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


def _send_gen(to_address: Address, amount: u256) -> None:
    if amount <= u256(0):
        _fail("Transfer amount must be positive")
    _Recipient(to_address).emit_transfer(value=amount)


# ============================================================================
# 6. SMALL DETERMINISTIC HELPERS
# ============================================================================

def _now_ts() -> int:
    """Deterministic transaction timestamp (pinned across all validators)."""
    return int(datetime.now(timezone.utc).timestamp())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fingerprint(items: list) -> str:
    """
    Lightweight FNV-1a 64-bit content fingerprint over an ordered list of
    strings, expressed as hex. This is NOT a cryptographic commitment (GenVM's
    restricted Python runtime does not guarantee a stdlib hashlib backend) —
    it exists purely as an audit/UI integrity fingerprint so the frontend and
    `co_sign_and_lock_bond()` can cheaply verify that the source list a
    customer is approving is byte-identical to what the provider proposed.
    The real, security-relevant immutability guarantee comes from the fact
    that `evidence_sources` is a storage field that is never mutated after
    an SLA leaves PROPOSED — not from this fingerprint.
    """
    h = 0xcbf29ce484222325  # FNV offset basis (64-bit)
    prime = 0x100000001b3
    mask = (1 << 64) - 1
    for item in items:
        for ch in item:
            h = h ^ ord(ch)
            h = (h * prime) & mask
        h = (h ^ 0x1F) & mask  # separator between list entries
    return format(h, "016x")


def _str_list_to_dynarray(items: list) -> DynArray[str]:
    arr = DynArray[str]()
    for item in items:
        arr.append(item)
    return arr


def _dynarray_to_list(arr: DynArray[str]) -> list:
    return [item for item in arr]


def _median_int(values: list) -> int:
    ordered = sorted(values)
    n = len(ordered)
    if n == 0:
        return _INCONCLUSIVE_SENTINEL
    mid = n // 2
    if n % 2 == 1:
        return ordered[mid]
    # even count — average the two middle values, floor to int minutes
    return (ordered[mid - 1] + ordered[mid]) // 2


def _parse_json_loose(text: str) -> dict:
    """Best-effort JSON extraction from LLM output that may wrap the object
    in prose or trailing commentary."""
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last < first:
        raise ValueError("no JSON object found")
    snippet = text[first:last + 1]
    snippet = re.sub(r",(?!\s*?[\{\[\"\'\w])", "", snippet)  # strip trailing commas
    return json.loads(snippet)


def _coerce_breach_minutes(data: dict, window_minutes: int) -> int:
    """
    Extract a breach-minutes figure from LLM output, defensively. Handles key
    aliasing and clamps to [0, window_minutes] so a hallucinated outlier from
    one node cannot blow up the equivalence comparison — both leader and
    validator apply the same clamp, so the clamp itself never causes a
    disagreement, it only prevents absurd values from being *stored*.
    """
    if not isinstance(data, dict):
        raise ValueError("non-dict LLM response")

    raw = data.get("breach_minutes")
    if raw is None:
        for alt in ("downtime_minutes", "minutes", "total_breach_minutes", "value"):
            if alt in data:
                raw = data[alt]
                break
    if raw is None:
        raise ValueError(f"missing breach_minutes key, got {list(data.keys())}")

    try:
        minutes = int(round(float(str(raw).strip())))
    except (ValueError, TypeError):
        raise ValueError(f"non-numeric breach_minutes: {raw}")

    if minutes < 0:
        minutes = 0
    if minutes > window_minutes:
        minutes = window_minutes
    return minutes


def _window_label(start_ts: int, end_ts: int) -> str:
    return f"{start_ts}:{end_ts}"


def _windows_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


# ============================================================================
# 7. NONDETERMINISTIC EVIDENCE PIPELINE
# ============================================================================
# This section is the heart of the protocol's GenLayer-native design. It is
# called from both `evaluate_claim()` and `resolve_challenge()`.
#
# Independent verification by construction: `_collect_breach_minutes` is the
# SAME function called by both the leader and every validator. Nobody calls
# it once and shares the answer — every node performs the full fetch + parse
# pipeline over EVERY pinned source, on its own, from scratch. The
# Equivalence Principle then compares the AGGREGATE NUMBER each node
# independently arrived at, never raw text, never a JSON shape, never a
# leader-supplied claim.

def _fetch_source_text(url: str) -> str:
    """
    Fetch a single evidence source. Tries a plain GET first (fast path for
    JSON/RSS/REST APIs); falls back to a rendered-text fetch for pages that
    need JS execution to produce their content. Any failure surfaces as an
    exception, which the caller treats as an unreachable source (sentinel).
    """
    try:
        response = gl.nondet.web.get(url)
        body = response.body
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        status = getattr(response, "status", None) or getattr(response, "status_code", None)
        if status is not None and int(status) >= 400:
            raise RuntimeError(f"{ERROR_EXTERNAL} source {url} returned status {status}")
        if body and body.strip():
            return body
    except Exception:
        pass

    # Fallback: rendered text mode, for JS-heavy status dashboards.
    rendered = gl.nondet.web.render(url, mode="text")
    if isinstance(rendered, bytes):
        rendered = rendered.decode("utf-8", errors="replace")
    return rendered


def _extract_breach_minutes_for_source(
    url: str,
    window_start_iso: str,
    window_end_iso: str,
    window_minutes: int,
) -> int:
    """
    Fetch one pinned source and ask the model to compute how many minutes of
    downtime it independently reports inside the claimed window. Returns
    _INCONCLUSIVE_SENTINEL (-1) if the source is unreachable or the model's
    answer cannot be reliably parsed — this source is then excluded from the
    aggregate rather than allowed to poison it.
    """
    try:
        content = _fetch_source_text(url)
    except Exception:
        return _INCONCLUSIVE_SENTINEL

    truncated = content[:MAX_FETCH_BODY_CHARS]

    prompt = f"""You are computing service downtime from a single raw status/telemetry
source for an onchain SLA dispute. Be precise and conservative.

CLAIMED WINDOW (UTC): {window_start_iso} to {window_end_iso}
This window is exactly {window_minutes} minutes long.

RAW SOURCE CONTENT (JSON, RSS, HTML, or plain text — format varies by source):
---
{truncated}
---

Determine how many minutes of the CLAIMED WINDOW show the monitored service as
down, degraded past its stated SLA threshold, or reporting an active incident,
based ONLY on the content above. If the content contains no evidence of an
incident overlapping the window, answer 0. If the content is unrelated,
empty, or does not let you determine downtime for this window, answer 0 and
set confidence to "low".

Respond with strict JSON only, no prose:
{{"breach_minutes": <integer 0 to {window_minutes}>, "confidence": "high" | "medium" | "low"}}"""

    try:
        raw_response = gl.nondet.exec_prompt(prompt, response_format="json")
    except Exception:
        return _INCONCLUSIVE_SENTINEL

    try:
        data = raw_response if isinstance(raw_response, dict) else _parse_json_loose(str(raw_response))
        return _coerce_breach_minutes(data, window_minutes)
    except Exception:
        return _INCONCLUSIVE_SENTINEL


def _collect_breach_minutes(
    sources: list,
    window_start_ts: int,
    window_end_ts: int,
) -> dict:
    """
    Runs the full independent-evidence pipeline over every pinned source and
    aggregates to a single breach-minutes figure via majority-quorum median.

    Quorum rule: at least a strict majority of sources must yield a usable
    figure, or the run is INCONCLUSIVE (sentinel -1). This is intentionally
    a *majority*, not *all sources*, requirement — a single flaky endpoint
    should not be able to force every claim to INCONCLUSIVE, but a genuinely
    unreachable evidence set correctly fails closed instead of guessing.
    """
    window_minutes = max(1, (window_end_ts - window_start_ts) // 60)
    window_start_iso = datetime.fromtimestamp(window_start_ts, tz=timezone.utc).isoformat()
    window_end_iso = datetime.fromtimestamp(window_end_ts, tz=timezone.utc).isoformat()

    per_source = []
    for url in sources:
        minutes = _extract_breach_minutes_for_source(
            url, window_start_iso, window_end_iso, window_minutes
        )
        per_source.append(minutes)

    valid = [m for m in per_source if m >= 0]
    total = len(per_source)
    required = (total // 2) + 1  # strict majority

    if len(valid) < required:
        return {
            "breach_minutes": _INCONCLUSIVE_SENTINEL,
            "reachable_count": len(valid),
            "total_sources": total,
            "per_source": per_source,
        }

    aggregate = _median_int(valid)
    return {
        "breach_minutes": aggregate,
        "reachable_count": len(valid),
        "total_sources": total,
        "per_source": per_source,
    }


def _handle_leader_error(leader_result, rerun_fn) -> bool:
    """Canonical validator-side error reconciliation, per GenLayer guidance:
    deterministic errors must match exactly, transient errors must both be
    transient, anything else (including LLM misbehavior) forces disagreement
    so the network rotates leaders instead of freezing on bad state."""
    leader_msg = getattr(leader_result, "message", "") or ""
    try:
        rerun_fn()
        return False  # leader errored but validator succeeded -> disagree
    except gl.vm.UserError as exc:
        validator_msg = getattr(exc, "message", str(exc))
        if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
            return validator_msg == leader_msg
        if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
            return True
        return False
    except Exception:
        return False


def _run_breach_consensus(sources: list, window_start_ts: int, window_end_ts: int, tolerance_minutes: int) -> dict:
    """
    Runs the leader/validator consensus round for a claim (or a challenge
    re-adjudication with an expanded source list). Returns
    {"breach_minutes": int, "inconclusive": bool, "reason": str}.

    Equivalence rule (the Equivalence Principle applied here):
      - Both sides independently derive an aggregate breach-minutes number
        (or the INCONCLUSIVE sentinel).
      - If either side is INCONCLUSIVE, BOTH must be INCONCLUSIVE to agree
        (a real numeric answer can never be "close enough" to "no answer").
      - Otherwise, the two aggregate numbers must be within
        `tolerance_minutes` of each other — a comparison on the COMPUTED
        RESULT, never on raw fetched text or JSON shape.
    """

    def leader_fn() -> dict:
        return _collect_breach_minutes(sources, window_start_ts, window_end_ts)

    def validator_fn(leader_result) -> bool:
        if not isinstance(leader_result, gl.vm.Return):
            return _handle_leader_error(leader_result, leader_fn)

        leader_data = leader_result.calldata
        validator_data = leader_fn()

        lb = leader_data["breach_minutes"]
        vb = validator_data["breach_minutes"]

        if lb == _INCONCLUSIVE_SENTINEL or vb == _INCONCLUSIVE_SENTINEL:
            return lb == vb

        return abs(lb - vb) <= tolerance_minutes

    result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    if result["breach_minutes"] == _INCONCLUSIVE_SENTINEL:
        return {
            "breach_minutes": 0,
            "inconclusive": True,
            "reason": (
                f"Only {result['reachable_count']}/{result['total_sources']} pinned "
                f"sources were independently reachable/parseable by a majority of "
                f"validators for this window."
            ),
        }

    return {
        "breach_minutes": result["breach_minutes"],
        "inconclusive": False,
        "reason": "",
    }


# ============================================================================
# 8. DETERMINISTIC SETTLEMENT (fully separated from the nondet step above)
# ============================================================================
# Validators and the LLM NEVER touch this function. It takes an
# already-agreed breach-minutes integer and turns it into a GEN payout using
# only integer arithmetic. This is what keeps monetary math auditable and
# outside the reach of any model.

def _compute_settlement(sla: "SLAAgreement", breach_minutes: int) -> dict:
    grace = int(sla.grace_minutes)
    billable_minutes = breach_minutes - grace
    if billable_minutes <= 0:
        return {
            "verdict": CLAIM_STATUS_RESOLVED_NO_BREACH,
            "payout_wei": u256(0),
            "recommended_payout_bps": u256(0),
        }

    raw_payout = u256(billable_minutes) * sla.penalty_rate_wei_per_min
    escrow = sla.escrow_deposited

    if raw_payout >= escrow:
        # Fully consumes escrow — capped, but still a full-breach verdict.
        return {
            "verdict": CLAIM_STATUS_RESOLVED_BREACH,
            "payout_wei": escrow,
            "recommended_payout_bps": u256(BPS_DENOMINATOR),
        }

    bps = u256(0) if escrow == u256(0) else (raw_payout * u256(BPS_DENOMINATOR)) // escrow
    return {
        "verdict": CLAIM_STATUS_RESOLVED_PARTIAL,
        "payout_wei": raw_payout,
        "recommended_payout_bps": bps,
    }


# ============================================================================
# 9. THE CONTRACT
# ============================================================================
# Explicit enumeration of every value-moving function (per the escrow
# discipline in the header comment) — grep this list against `_send_gen`
# and `self.withdrawable[...] +=` call sites to audit money flow:
#   IN  : lock_provider_escrow, co_sign_and_lock_bond, file_challenge
#   OUT : withdraw (the only function that calls _send_gen)
#   INTERNAL CREDIT (moves funds from a ledger to a withdrawable balance,
#                    no external transfer yet):
#         finalize_claim, resolve_challenge, cancel_sla,
#         reclaim_stale_proposal, terminate_expired_sla

class UptimeArbiter(gl.Contract):
    # -- identity / registry -------------------------------------------------
    protocol_owner: Address
    sla_counter: u256
    claim_counter: u256
    challenge_counter: u256

    slas: TreeMap[str, SLAAgreement]
    sla_order: DynArray[str]
    claims: TreeMap[str, Claim]
    claim_order: DynArray[str]
    challenges: TreeMap[str, Challenge]

    withdrawable: TreeMap[str, u256]

    # -- O(1) protocol stats (never scanned/recomputed, updated inline) -----
    total_active_escrow_wei: u256
    total_slas_registered: u256
    total_slas_active: u256
    total_claims_submitted: u256
    total_claims_resolved_breach: u256
    total_claims_resolved_partial: u256
    total_claims_resolved_no_breach: u256
    total_claims_inconclusive: u256
    total_challenges_filed: u256
    total_challenges_overturned: u256

    def __init__(self) -> None:
        self.protocol_owner = gl.message.sender_address
        self.sla_counter = u256(0)
        self.claim_counter = u256(0)
        self.challenge_counter = u256(0)
        self.total_active_escrow_wei = u256(0)
        self.total_slas_registered = u256(0)
        self.total_slas_active = u256(0)
        self.total_claims_submitted = u256(0)
        self.total_claims_resolved_breach = u256(0)
        self.total_claims_resolved_partial = u256(0)
        self.total_claims_resolved_no_breach = u256(0)
        self.total_claims_inconclusive = u256(0)
        self.total_challenges_filed = u256(0)
        self.total_challenges_overturned = u256(0)

    # ------------------------------------------------------------------
    # 9.1 CONFIG / VIEWS
    # ------------------------------------------------------------------

    @gl.public.view
    def get_protocol_config(self) -> dict:
        return {
            "min_evidence_sources": MIN_EVIDENCE_SOURCES,
            "max_evidence_sources": MAX_EVIDENCE_SOURCES,
            "min_tolerance_minutes": MIN_TOLERANCE_MINUTES,
            "max_tolerance_minutes": MAX_TOLERANCE_MINUTES,
            "default_tolerance_minutes": DEFAULT_TOLERANCE_MINUTES,
            "min_challenge_window_seconds": MIN_CHALLENGE_WINDOW_SECONDS,
            "max_challenge_window_seconds": MAX_CHALLENGE_WINDOW_SECONDS,
            "default_challenge_window_seconds": DEFAULT_CHALLENGE_WINDOW_SECONDS,
            "min_term_seconds": MIN_TERM_SECONDS,
            "max_term_seconds": MAX_TERM_SECONDS,
            "min_penalty_rate_wei_per_min": MIN_PENALTY_RATE_WEI_PER_MIN,
            "max_penalty_rate_wei_per_min": MAX_PENALTY_RATE_WEI_PER_MIN,
            "min_escrow_wei": MIN_ESCROW_WEI,
            "min_challenge_bond_bps": MIN_CHALLENGE_BOND_BPS,
            "max_additional_sources_per_challenge": MAX_ADDITIONAL_SOURCES_PER_CHALLENGE,
            "max_challenge_rounds_per_claim": MAX_CHALLENGE_ROUNDS_PER_CLAIM,
        }

    @gl.public.view
    def get_protocol_stats(self) -> dict:
        return {
            "total_active_escrow_wei": str(self.total_active_escrow_wei),
            "total_slas_registered": str(self.total_slas_registered),
            "total_slas_active": str(self.total_slas_active),
            "total_claims_submitted": str(self.total_claims_submitted),
            "total_claims_resolved_breach": str(self.total_claims_resolved_breach),
            "total_claims_resolved_partial": str(self.total_claims_resolved_partial),
            "total_claims_resolved_no_breach": str(self.total_claims_resolved_no_breach),
            "total_claims_inconclusive": str(self.total_claims_inconclusive),
            "total_challenges_filed": str(self.total_challenges_filed),
            "total_challenges_overturned": str(self.total_challenges_overturned),
        }

    @gl.public.view
    def get_sla(self, sla_id: str) -> dict:
        sla = self._get_sla_or_fail(sla_id)
        return self._sla_to_dict(sla)

    @gl.public.view
    def list_sla_ids(self, offset: int, limit: int) -> list:
        limit = max(0, min(limit, 200))
        offset = max(0, offset)
        n = len(self.sla_order)
        result = []
        i = offset
        while i < n and len(result) < limit:
            result.append(self.sla_order[i])
            i += 1
        return result

    @gl.public.view
    def get_claim(self, claim_id: str) -> dict:
        claim = self._get_claim_or_fail(claim_id)
        return self._claim_to_dict(claim)

    @gl.public.view
    def list_claim_ids(self, offset: int, limit: int) -> list:
        limit = max(0, min(limit, 200))
        offset = max(0, offset)
        n = len(self.claim_order)
        result = []
        i = offset
        while i < n and len(result) < limit:
            result.append(self.claim_order[i])
            i += 1
        return result

    @gl.public.view
    def get_challenge(self, challenge_id: str) -> dict:
        challenge = self._get_challenge_or_fail(challenge_id)
        return self._challenge_to_dict(challenge)

    @gl.public.view
    def get_withdrawable_balance(self, address: str) -> str:
        key = self._balance_key(Address(address))
        if key in self.withdrawable:
            return str(self.withdrawable[key])
        return "0"

    # ------------------------------------------------------------------
    # 9.2 SLA REGISTRATION (custody in, side A: proposal — no funds yet)
    # ------------------------------------------------------------------

    @gl.public.write
    def propose_sla(
        self,
        customer: str,
        label: str,
        target_uptime_bps: int,
        grace_minutes: int,
        penalty_rate_wei_per_min: str,
        escrow_wei: str,
        bond_wei: str,
        challenge_bond_wei: str,
        tolerance_minutes: int,
        challenge_window_seconds: int,
        term_seconds: int,
        registration_ttl_seconds: int,
        evidence_sources: list,
    ) -> str:
        """
        Provider proposes SLA terms and pins the evidence-source list. No
        money moves here. The SLA only becomes ACTIVE once BOTH
        `lock_provider_escrow()` and `co_sign_and_lock_bond()` have been
        called (in either order) by the correct counterparties.
        """
        provider = gl.message.sender_address
        customer_addr = Address(customer)
        _require(str(provider) != str(customer_addr), "Provider and customer must differ")
        _require(0 < len(label) <= MAX_LABEL_LENGTH, "Invalid label length")
        _require(0 <= target_uptime_bps <= BPS_DENOMINATOR, "target_uptime_bps out of range")
        _require(0 <= grace_minutes <= MAX_GRACE_MINUTES, "grace_minutes out of range")

        penalty_rate = u256(int(penalty_rate_wei_per_min))
        _require(
            MIN_PENALTY_RATE_WEI_PER_MIN <= int(penalty_rate) <= MAX_PENALTY_RATE_WEI_PER_MIN,
            "penalty_rate_wei_per_min out of range",
        )

        escrow = u256(int(escrow_wei))
        _require(int(escrow) >= MIN_ESCROW_WEI, "escrow_wei below protocol minimum")

        bond = u256(int(bond_wei))
        _require(int(bond) >= 0, "bond_wei must be non-negative")

        challenge_bond = u256(int(challenge_bond_wei))
        min_challenge_bond = (int(escrow) * MIN_CHALLENGE_BOND_BPS) // BPS_DENOMINATOR
        _require(
            int(challenge_bond) >= max(1, min_challenge_bond),
            f"challenge_bond_wei must be at least {MIN_CHALLENGE_BOND_BPS} bps of escrow_wei",
        )

        _require(
            MIN_TOLERANCE_MINUTES <= tolerance_minutes <= MAX_TOLERANCE_MINUTES,
            "tolerance_minutes out of range",
        )
        _require(
            MIN_CHALLENGE_WINDOW_SECONDS <= challenge_window_seconds <= MAX_CHALLENGE_WINDOW_SECONDS,
            "challenge_window_seconds out of range",
        )
        _require(MIN_TERM_SECONDS <= term_seconds <= MAX_TERM_SECONDS, "term_seconds out of range")
        _require(
            MIN_REGISTRATION_TTL_SECONDS <= registration_ttl_seconds <= MAX_REGISTRATION_TTL_SECONDS,
            "registration_ttl_seconds out of range",
        )

        _require(
            MIN_EVIDENCE_SOURCES <= len(evidence_sources) <= MAX_EVIDENCE_SOURCES,
            f"evidence_sources must contain between {MIN_EVIDENCE_SOURCES} and {MAX_EVIDENCE_SOURCES} entries",
        )
        seen = set()
        for url in evidence_sources:
            _require(isinstance(url, str) and 0 < len(url) <= MAX_SOURCE_URL_LENGTH, "invalid evidence source URL")
            _require(url.startswith("https://") or url.startswith("http://"), "evidence sources must be http(s) URLs")
            _require(url not in seen, "duplicate evidence source URL")
            seen.add(url)

        self.sla_counter = self.sla_counter + u256(1)
        sla_id = f"SLA-{int(self.sla_counter)}"
        now = _now_ts()

        sla = SLAAgreement(
            sla_id=sla_id,
            provider=provider,
            customer=customer_addr,
            label=label,
            target_uptime_bps=u256(target_uptime_bps),
            grace_minutes=u256(grace_minutes),
            penalty_rate_wei_per_min=penalty_rate,
            escrow_wei=escrow,
            escrow_deposited=u256(0),
            bond_wei=bond,
            bond_deposited=u256(0),
            challenge_bond_wei=challenge_bond,
            tolerance_minutes=u256(tolerance_minutes),
            challenge_window_seconds=u256(challenge_window_seconds),
            term_seconds=u256(term_seconds),
            evidence_sources=_str_list_to_dynarray(evidence_sources),
            source_digest=_fingerprint(evidence_sources),
            adjudicated_windows=DynArray[str](),
            status=SLA_STATUS_PROPOSED,
            provider_funded=False,
            customer_signed=False,
            created_at=_now_iso(),
            registration_deadline_ts=u256(now + registration_ttl_seconds),
            term_start_ts=u256(0),
            term_end_ts=u256(0),
            active_claim_id="",
        )
        self.slas[sla_id] = sla
        self.sla_order.append(sla_id)
        self.total_slas_registered = self.total_slas_registered + u256(1)
        return sla_id

    @gl.public.write.payable
    def lock_provider_escrow(self, sla_id: str) -> None:
        sla = self._get_sla_or_fail(sla_id)
        _require(sla.status == SLA_STATUS_PROPOSED, "SLA is not awaiting escrow")
        _require(gl.message.sender_address == sla.provider, "Only the proposing provider may fund escrow")
        _require(not sla.provider_funded, "Provider escrow already locked")
        value = gl.message.value
        _require(value == sla.escrow_wei, "Sent value must exactly match the agreed escrow_wei")

        sla.escrow_deposited = value
        sla.provider_funded = True
        self.total_active_escrow_wei = self.total_active_escrow_wei + value
        self.slas[sla_id] = sla
        self._maybe_activate(sla_id)

    @gl.public.write.payable
    def co_sign_and_lock_bond(self, sla_id: str, expected_source_digest: str) -> None:
        sla = self._get_sla_or_fail(sla_id)
        _require(sla.status == SLA_STATUS_PROPOSED, "SLA is not awaiting co-signature")
        _require(gl.message.sender_address == sla.customer, "Only the named customer may co-sign")
        _require(not sla.customer_signed, "Customer has already co-signed")
        _require(expected_source_digest == sla.source_digest, "Evidence source digest mismatch — refresh and re-review before signing")

        value = gl.message.value
        if sla.bond_wei > u256(0):
            _require(value == sla.bond_wei, "Sent value must exactly match the agreed bond_wei")
        else:
            _require(value == u256(0), "This SLA defines no customer bond; send zero value")

        sla.bond_deposited = value
        sla.customer_signed = True
        if value > u256(0):
            self.total_active_escrow_wei = self.total_active_escrow_wei + value
        self.slas[sla_id] = sla
        self._maybe_activate(sla_id)

    def _maybe_activate(self, sla_id: str) -> None:
        sla = self.slas[sla_id]
        if sla.provider_funded and sla.customer_signed and sla.status == SLA_STATUS_PROPOSED:
            now = _now_ts()
            sla.status = SLA_STATUS_ACTIVE
            sla.term_start_ts = u256(now)
            sla.term_end_ts = u256(now + int(sla.term_seconds))
            self.slas[sla_id] = sla
            self.total_slas_active = self.total_slas_active + u256(1)

    @gl.public.write
    def cancel_sla(self, sla_id: str) -> None:
        """Either party can withdraw a proposal before it goes ACTIVE. Any
        deposit already made (by either side) is refunded via the pull
        balance — no funds are lost, no counterpart is left exposed."""
        sla = self._get_sla_or_fail(sla_id)
        sender = gl.message.sender_address
        _require(sender == sla.provider or sender == sla.customer, "Not a party to this SLA")
        _require(sla.status == SLA_STATUS_PROPOSED, "Only a PROPOSED SLA can be cancelled")
        self._refund_unactivated_deposits(sla)

    @gl.public.write
    def reclaim_stale_proposal(self, sla_id: str) -> None:
        """Recovery/timeout exit: if a PROPOSED SLA sits unsigned past its
        registration deadline, ANYONE may trigger cleanup and refund
        whichever side already deposited — funds can never be locked
        forever by a counterparty who goes silent before activation."""
        sla = self._get_sla_or_fail(sla_id)
        _require(sla.status == SLA_STATUS_PROPOSED, "SLA is not in PROPOSED state")
        _require(_now_ts() >= int(sla.registration_deadline_ts), "Registration deadline has not passed yet")
        self._refund_unactivated_deposits(sla)

    def _refund_unactivated_deposits(self, sla: "SLAAgreement") -> None:
        escrow = sla.escrow_deposited
        bond = sla.bond_deposited
        sla.escrow_deposited = u256(0)
        sla.bond_deposited = u256(0)
        sla.status = SLA_STATUS_CANCELLED
        self.slas[sla.sla_id] = sla

        if escrow > u256(0):
            self._credit(sla.provider, escrow)
            self.total_active_escrow_wei = self.total_active_escrow_wei - escrow
        if bond > u256(0):
            self._credit(sla.customer, bond)
            self.total_active_escrow_wei = self.total_active_escrow_wei - bond

    @gl.public.write
    def terminate_expired_sla(self, sla_id: str) -> None:
        """Exit path for an SLA that ran its full term with no open claim:
        escrow returns to the provider, bond returns to the customer.
        Callable by anyone once the term has passed, so settlement never
        depends on either party remembering to close it out."""
        sla = self._get_sla_or_fail(sla_id)
        _require(sla.status == SLA_STATUS_ACTIVE, "SLA is not ACTIVE")
        _require(sla.active_claim_id == "", "An open claim must resolve and finalize first")
        _require(_now_ts() >= int(sla.term_end_ts), "SLA term has not ended yet")

        escrow = sla.escrow_deposited
        bond = sla.bond_deposited
        sla.escrow_deposited = u256(0)
        sla.bond_deposited = u256(0)
        sla.status = SLA_STATUS_CONCLUDED
        self.slas[sla_id] = sla

        if escrow > u256(0):
            self._credit(sla.provider, escrow)
            self.total_active_escrow_wei = self.total_active_escrow_wei - escrow
        if bond > u256(0):
            self._credit(sla.customer, bond)
            self.total_active_escrow_wei = self.total_active_escrow_wei - bond

    # ------------------------------------------------------------------
    # 9.3 CLAIMS — pin first, evaluate second (nondeterministic), settle
    #      third (deterministic)
    # ------------------------------------------------------------------

    @gl.public.write
    def submit_claim(self, sla_id: str, window_start_ts: int, window_end_ts: int) -> str:
        """
        Immediately pins the claimed window and a snapshot of the current
        evidence-source list BEFORE any validator evaluation happens. This
        is the "commit" half of the trust boundary — nothing about the
        evidence set can move after this call returns.
        """
        sla = self._get_sla_or_fail(sla_id)
        _require(sla.status == SLA_STATUS_ACTIVE, "SLA is not ACTIVE")
        _require(gl.message.sender_address == sla.customer, "Only the customer may submit a breach claim")
        _require(sla.active_claim_id == "", "SLA already has an open claim in progress")

        _require(window_end_ts > window_start_ts, "window_end_ts must be after window_start_ts")
        window_minutes = (window_end_ts - window_start_ts) // 60
        _require(
            MIN_CLAIM_WINDOW_MINUTES <= window_minutes <= MAX_CLAIM_WINDOW_MINUTES,
            "claimed window length out of allowed range",
        )
        _require(
            window_start_ts >= int(sla.term_start_ts) and window_end_ts <= int(sla.term_end_ts),
            "claimed window must fall within the SLA's active term",
        )

        for adjudicated in sla.adjudicated_windows:
            prev_start_str, prev_end_str = adjudicated.split(":")
            if _windows_overlap(window_start_ts, window_end_ts, int(prev_start_str), int(prev_end_str)):
                _fail("claimed window overlaps a window already adjudicated for this SLA")

        self.claim_counter = self.claim_counter + u256(1)
        claim_id = f"CLM-{int(self.claim_counter)}"

        sources_snapshot = _dynarray_to_list(sla.evidence_sources)
        claim = Claim(
            claim_id=claim_id,
            sla_id=sla_id,
            claimant=gl.message.sender_address,
            window_start_ts=u256(window_start_ts),
            window_end_ts=u256(window_end_ts),
            pinned_sources=_str_list_to_dynarray(sources_snapshot),
            pinned_source_digest=sla.source_digest,
            submitted_at=_now_iso(),
            status=CLAIM_STATUS_PINNED,
            breach_minutes=u256(0),
            inconclusive_reason="",
            recommended_payout_bps=u256(0),
            payout_wei=u256(0),
            resolved_at="",
            challenge_deadline_ts=u256(0),
            challenge_count=u256(0),
            active_challenge_id="",
            is_challenged=False,
            finalized=False,
        )
        self.claims[claim_id] = claim
        self.claim_order.append(claim_id)

        sla.active_claim_id = claim_id
        self.slas[sla_id] = sla
        self.total_claims_submitted = self.total_claims_submitted + u256(1)
        return claim_id

    @gl.public.write
    def evaluate_claim(self, claim_id: str) -> None:
        """
        Permissionless trigger (anyone may call this — a keeper bot, the
        frontend, either party) that runs the independent multi-validator
        evidence fetch and, on a conclusive result, the deterministic
        settlement calculation. This is the ONLY place the nondeterministic
        pipeline and the deterministic settlement function are both invoked
        in sequence, and they remain two separate function calls with a
        hard boundary between them.
        """
        claim = self._get_claim_or_fail(claim_id)
        _require(claim.status == CLAIM_STATUS_PINNED, "Claim has already been evaluated")
        sla = self._get_sla_or_fail(claim.sla_id)

        consensus = _run_breach_consensus(
            _dynarray_to_list(claim.pinned_sources),
            int(claim.window_start_ts),
            int(claim.window_end_ts),
            int(sla.tolerance_minutes),
        )

        if consensus["inconclusive"]:
            claim.status = CLAIM_STATUS_INCONCLUSIVE
            claim.inconclusive_reason = consensus["reason"]
            claim.resolved_at = _now_iso()
            self.claims[claim_id] = claim

            sla.active_claim_id = ""
            self.slas[claim.sla_id] = sla
            self.total_claims_inconclusive = self.total_claims_inconclusive + u256(1)
            return

        breach_minutes = consensus["breach_minutes"]
        settlement = _compute_settlement(sla, breach_minutes)

        claim.breach_minutes = u256(breach_minutes)
        claim.status = settlement["verdict"]
        claim.payout_wei = settlement["payout_wei"]
        claim.recommended_payout_bps = settlement["recommended_payout_bps"]
        claim.resolved_at = _now_iso()
        claim.challenge_deadline_ts = u256(_now_ts() + int(sla.challenge_window_seconds))
        self.claims[claim_id] = claim

        if settlement["verdict"] == CLAIM_STATUS_RESOLVED_BREACH:
            self.total_claims_resolved_breach = self.total_claims_resolved_breach + u256(1)
        elif settlement["verdict"] == CLAIM_STATUS_RESOLVED_PARTIAL:
            self.total_claims_resolved_partial = self.total_claims_resolved_partial + u256(1)
        else:
            self.total_claims_resolved_no_breach = self.total_claims_resolved_no_breach + u256(1)

    # ------------------------------------------------------------------
    # 9.4 CHALLENGES — additive-only evidence, bonded, single re-run of the
    #      exact same nondeterministic pipeline over an EXPANDED source set
    # ------------------------------------------------------------------

    @gl.public.write.payable
    def file_challenge(self, claim_id: str, additional_sources: list, rationale: str) -> str:
        claim = self._get_claim_or_fail(claim_id)
        _require(claim.status in _CLAIM_RESOLVED_STATUSES, "Only a resolved claim can be challenged")
        _require(not claim.finalized, "Claim has already been finalized")
        _require(not claim.is_challenged, "A challenge is already pending on this claim")
        _require(_now_ts() < int(claim.challenge_deadline_ts), "Challenge window has closed")
        _require(int(claim.challenge_count) < MAX_CHALLENGE_ROUNDS_PER_CLAIM, "Maximum challenge rounds reached for this claim")

        sla = self._get_sla_or_fail(claim.sla_id)
        sender = gl.message.sender_address
        _require(sender == sla.provider or sender == sla.customer, "Only a party to the SLA may challenge")

        _require(
            1 <= len(additional_sources) <= MAX_ADDITIONAL_SOURCES_PER_CHALLENGE,
            f"must supply between 1 and {MAX_ADDITIONAL_SOURCES_PER_CHALLENGE} additional sources",
        )
        existing = set(_dynarray_to_list(claim.pinned_sources))
        for url in additional_sources:
            _require(isinstance(url, str) and 0 < len(url) <= MAX_SOURCE_URL_LENGTH, "invalid additional source URL")
            _require(url.startswith("https://") or url.startswith("http://"), "additional sources must be http(s) URLs")
            _require(url not in existing, "additional source duplicates an already-pinned source")
        _require(0 < len(rationale) <= MAX_RATIONALE_LENGTH, "invalid rationale length")

        value = gl.message.value
        _require(value == sla.challenge_bond_wei, "Sent value must exactly match the SLA's challenge_bond_wei")

        self.challenge_counter = self.challenge_counter + u256(1)
        challenge_id = f"DSP-{int(self.challenge_counter)}"

        challenge = Challenge(
            challenge_id=challenge_id,
            claim_id=claim_id,
            challenger=sender,
            additional_sources=_str_list_to_dynarray(additional_sources),
            rationale=rationale,
            bond_wei=value,
            bond_deposited=value,
            filed_at=_now_iso(),
            resolved=False,
            outcome=CHALLENGE_OUTCOME_PENDING,
            resolved_at="",
            prior_breach_minutes=claim.breach_minutes,
            new_breach_minutes=u256(0),
        )
        self.challenges[challenge_id] = challenge

        claim.is_challenged = True
        claim.active_challenge_id = challenge_id
        claim.challenge_count = claim.challenge_count + u256(1)
        # Re-open the settlement window so resolution has time to complete
        # without racing an already-in-flight deadline.
        claim.challenge_deadline_ts = u256(_now_ts() + int(sla.challenge_window_seconds))
        self.claims[claim_id] = claim

        self.total_active_escrow_wei = self.total_active_escrow_wei + value
        self.total_challenges_filed = self.total_challenges_filed + u256(1)
        return challenge_id

    @gl.public.write
    def resolve_challenge(self, challenge_id: str) -> None:
        """
        Permissionless trigger that re-runs the exact same independent
        multi-validator pipeline as `evaluate_claim`, but over the ORIGINAL
        pinned sources PLUS the challenge's additional sources — the
        original set is never removed or replaced, only appended to.
        """
        challenge = self._get_challenge_or_fail(challenge_id)
        _require(not challenge.resolved, "Challenge has already been resolved")
        claim = self._get_claim_or_fail(challenge.claim_id)
        sla = self._get_sla_or_fail(claim.sla_id)

        combined_sources = _dynarray_to_list(claim.pinned_sources) + _dynarray_to_list(challenge.additional_sources)
        consensus = _run_breach_consensus(
            combined_sources,
            int(claim.window_start_ts),
            int(claim.window_end_ts),
            int(sla.tolerance_minutes),
        )

        challenger = challenge.challenger
        counterparty = sla.customer if str(challenger) == str(sla.provider) else sla.provider

        if consensus["inconclusive"]:
            # Re-adjudication itself could not reach quorum — refund the
            # challenger rather than punishing them for an evidence-network
            # problem outside anyone's control. Original verdict stands.
            challenge.resolved = True
            challenge.outcome = CHALLENGE_OUTCOME_INCONCLUSIVE_RETRY
            challenge.resolved_at = _now_iso()
            self.challenges[challenge_id] = challenge

            self._release_challenge_bond(sla, challenge, refund_to=challenger)
            self._close_challenge_on_claim(claim)
            return

        new_breach_minutes = consensus["breach_minutes"]
        original_breach_minutes = int(challenge.prior_breach_minutes)
        tolerance = int(sla.tolerance_minutes)
        challenge.new_breach_minutes = u256(new_breach_minutes)

        if abs(new_breach_minutes - original_breach_minutes) <= tolerance:
            # Original verdict upheld — challenger loses their bond to the
            # counterparty who did not need to challenge.
            challenge.resolved = True
            challenge.outcome = CHALLENGE_OUTCOME_UPHELD_ORIGINAL
            challenge.resolved_at = _now_iso()
            self.challenges[challenge_id] = challenge

            self._release_challenge_bond(sla, challenge, refund_to=counterparty)
            self._close_challenge_on_claim(claim)
            return

        # Overturned — recompute the deterministic settlement with the new
        # figure and refund the challenger's bond.
        settlement = _compute_settlement(sla, new_breach_minutes)
        claim.breach_minutes = u256(new_breach_minutes)
        claim.status = settlement["verdict"]
        claim.payout_wei = settlement["payout_wei"]
        claim.recommended_payout_bps = settlement["recommended_payout_bps"]
        claim.resolved_at = _now_iso()
        self.claims[claim.claim_id] = claim

        challenge.resolved = True
        challenge.outcome = CHALLENGE_OUTCOME_OVERTURNED
        challenge.resolved_at = _now_iso()
        self.challenges[challenge_id] = challenge

        self._release_challenge_bond(sla, challenge, refund_to=challenger)
        self._close_challenge_on_claim(claim)
        self.total_challenges_overturned = self.total_challenges_overturned + u256(1)

    def _release_challenge_bond(self, sla: "SLAAgreement", challenge: "Challenge", refund_to: Address) -> None:
        amount = challenge.bond_deposited
        challenge.bond_deposited = u256(0)
        self.challenges[challenge.challenge_id] = challenge
        if amount > u256(0):
            self._credit(refund_to, amount)
            self.total_active_escrow_wei = self.total_active_escrow_wei - amount

    def _close_challenge_on_claim(self, claim: "Claim") -> None:
        claim.is_challenged = False
        claim.active_challenge_id = ""
        self.claims[claim.claim_id] = claim

    # ------------------------------------------------------------------
    # 9.5 FINALIZATION — funds only become withdrawable once the challenge
    #      window has closed with no pending challenge
    # ------------------------------------------------------------------

    @gl.public.write
    def finalize_claim(self, claim_id: str) -> None:
        claim = self._get_claim_or_fail(claim_id)
        _require(claim.status in _CLAIM_RESOLVED_STATUSES, "Claim is not in a resolved state")
        _require(not claim.finalized, "Claim has already been finalized")
        _require(not claim.is_challenged, "A challenge is still pending — resolve it first")
        _require(_now_ts() >= int(claim.challenge_deadline_ts), "Challenge window has not closed yet")

        sla = self._get_sla_or_fail(claim.sla_id)

        # --- ledger read + zero, BEFORE any credit (zero-then-transfer) ---
        escrow = sla.escrow_deposited
        bond = sla.bond_deposited
        sla.escrow_deposited = u256(0)
        sla.bond_deposited = u256(0)
        sla.active_claim_id = ""
        sla.adjudicated_windows.append(_window_label(int(claim.window_start_ts), int(claim.window_end_ts)))
        self.slas[sla.sla_id] = sla

        claim.finalized = True
        self.claims[claim_id] = claim

        payout = claim.payout_wei
        if payout > escrow:
            payout = escrow  # defensive re-clamp; _compute_settlement already caps this

        if claim.status in (CLAIM_STATUS_RESOLVED_BREACH, CLAIM_STATUS_RESOLVED_PARTIAL):
            provider_refund = escrow - payout
            if payout > u256(0):
                self._credit(claim.claimant, payout)
            if provider_refund > u256(0):
                self._credit(sla.provider, provider_refund)
            if bond > u256(0):
                # Claim upheld — the registration bond was never at risk.
                self._credit(sla.customer, bond)
        else:
            # NO_BREACH — the claim was unfounded. Provider's escrow returns
            # in full; the customer's registration bond is forfeit to the
            # provider as the agreed anti-frivolous-claim mechanism.
            if escrow > u256(0):
                self._credit(sla.provider, escrow)
            if bond > u256(0):
                self._credit(sla.provider, bond)

        released = escrow + bond
        if released > u256(0):
            self.total_active_escrow_wei = self.total_active_escrow_wei - released

    # ------------------------------------------------------------------
    # 9.6 WITHDRAWAL — the only function that ever calls `_send_gen`
    # ------------------------------------------------------------------

    @gl.public.write
    def withdraw(self) -> None:
        sender = gl.message.sender_address
        key = self._balance_key(sender)
        amount = self.withdrawable[key] if key in self.withdrawable else u256(0)
        _require(amount > u256(0), "No withdrawable balance")

        # Zero BEFORE transfer — a re-entrant call finds a zero balance and
        # is rejected by the check above, closing the reentrancy window.
        self.withdrawable[key] = u256(0)
        _send_gen(sender, amount)

    # ------------------------------------------------------------------
    # 9.7 INTERNAL UTILITIES
    # ------------------------------------------------------------------

    def _credit(self, address: Address, amount: u256) -> None:
        if amount <= u256(0):
            return
        key = self._balance_key(address)
        current = self.withdrawable[key] if key in self.withdrawable else u256(0)
        self.withdrawable[key] = current + amount

    def _balance_key(self, address: Address) -> str:
        return str(address).lower()

    def _get_sla_or_fail(self, sla_id: str) -> "SLAAgreement":
        if sla_id not in self.slas:
            _fail(f"Unknown sla_id: {sla_id}")
        return self.slas[sla_id]

    def _get_claim_or_fail(self, claim_id: str) -> "Claim":
        if claim_id not in self.claims:
            _fail(f"Unknown claim_id: {claim_id}")
        return self.claims[claim_id]

    def _get_challenge_or_fail(self, challenge_id: str) -> "Challenge":
        if challenge_id not in self.challenges:
            _fail(f"Unknown challenge_id: {challenge_id}")
        return self.challenges[challenge_id]

    def _sla_to_dict(self, sla: "SLAAgreement") -> dict:
        return {
            "sla_id": sla.sla_id,
            "provider": str(sla.provider),
            "customer": str(sla.customer),
            "label": sla.label,
            "target_uptime_bps": int(sla.target_uptime_bps),
            "grace_minutes": int(sla.grace_minutes),
            "penalty_rate_wei_per_min": str(sla.penalty_rate_wei_per_min),
            "escrow_wei": str(sla.escrow_wei),
            "escrow_deposited": str(sla.escrow_deposited),
            "bond_wei": str(sla.bond_wei),
            "bond_deposited": str(sla.bond_deposited),
            "challenge_bond_wei": str(sla.challenge_bond_wei),
            "tolerance_minutes": int(sla.tolerance_minutes),
            "challenge_window_seconds": int(sla.challenge_window_seconds),
            "term_seconds": int(sla.term_seconds),
            "evidence_sources": _dynarray_to_list(sla.evidence_sources),
            "source_digest": sla.source_digest,
            "adjudicated_windows": _dynarray_to_list(sla.adjudicated_windows),
            "status": sla.status,
            "provider_funded": sla.provider_funded,
            "customer_signed": sla.customer_signed,
            "created_at": sla.created_at,
            "registration_deadline_ts": int(sla.registration_deadline_ts),
            "term_start_ts": int(sla.term_start_ts),
            "term_end_ts": int(sla.term_end_ts),
            "active_claim_id": sla.active_claim_id,
        }

    def _claim_to_dict(self, claim: "Claim") -> dict:
        return {
            "claim_id": claim.claim_id,
            "sla_id": claim.sla_id,
            "claimant": str(claim.claimant),
            "window_start_ts": int(claim.window_start_ts),
            "window_end_ts": int(claim.window_end_ts),
            "pinned_sources": _dynarray_to_list(claim.pinned_sources),
            "pinned_source_digest": claim.pinned_source_digest,
            "submitted_at": claim.submitted_at,
            "status": claim.status,
            "breach_minutes": int(claim.breach_minutes),
            "inconclusive_reason": claim.inconclusive_reason,
            "recommended_payout_bps": int(claim.recommended_payout_bps),
            "payout_wei": str(claim.payout_wei),
            "resolved_at": claim.resolved_at,
            "challenge_deadline_ts": int(claim.challenge_deadline_ts),
            "challenge_count": int(claim.challenge_count),
            "active_challenge_id": claim.active_challenge_id,
            "is_challenged": claim.is_challenged,
            "finalized": claim.finalized,
        }

    def _challenge_to_dict(self, challenge: "Challenge") -> dict:
        return {
            "challenge_id": challenge.challenge_id,
            "claim_id": challenge.claim_id,
            "challenger": str(challenge.challenger),
            "additional_sources": _dynarray_to_list(challenge.additional_sources),
            "rationale": challenge.rationale,
            "bond_wei": str(challenge.bond_wei),
            "bond_deposited": str(challenge.bond_deposited),
            "filed_at": challenge.filed_at,
            "resolved": challenge.resolved,
            "outcome": challenge.outcome,
            "resolved_at": challenge.resolved_at,
            "prior_breach_minutes": int(challenge.prior_breach_minutes),
            "new_breach_minutes": int(challenge.new_breach_minutes),
        }
