import json

GEN = 10**18
CONTRACT = "contracts/UptimeArbiter.py"

DEFAULT_SOURCES = [
    "https://www.githubstatus.com/api/v2/summary.json",
    "https://status.openai.com/api/v2/summary.json",
    "https://status.aws.amazon.com/rss/ec2-us-east-1.rss",
]


def hexaddr(addr) -> str:
    """Test fixtures (direct_alice, direct_bob, ...) are raw 20-byte
    addresses; contract calldata params typed `str` expect a '0x...' hex
    address (or base64) per genlayer.py.types.Address.__init__."""
    if isinstance(addr, (bytes, bytearray)):
        return "0x" + addr.hex()
    return str(addr)


def propose_default_sla(
    contract,
    vm,
    provider,
    customer,
    *,
    escrow_wei=50_000 * GEN,
    bond_wei=5_000 * GEN,
    challenge_bond_wei=2_500 * GEN,
    penalty_rate_wei_per_min=250 * GEN,
    tolerance_minutes=2,
    challenge_window_seconds=72 * 3600,
    term_seconds=30 * 86400,
    registration_ttl_seconds=7 * 86400,
    sources=None,
    exclusion_terms="",
    grace_minutes=21,
    target_uptime_bps=9995,
    label="Test SLA",
):
    """Registers an SLA with sane defaults, matching the frontend's own
    sample-fill values, so every test isn't re-deriving the same 13 args."""
    vm.sender = provider
    return contract.propose_sla(
        hexaddr(customer),
        label,
        target_uptime_bps,
        grace_minutes,
        str(penalty_rate_wei_per_min),
        str(escrow_wei),
        str(bond_wei),
        str(challenge_bond_wei),
        tolerance_minutes,
        challenge_window_seconds,
        term_seconds,
        registration_ttl_seconds,
        sources or list(DEFAULT_SOURCES),
        exclusion_terms,
    )


def activate_default_sla(contract, vm, provider, customer, sla_id, **kwargs):
    """propose + fund + co-sign, landing the SLA in ACTIVE. Returns the sla dict."""
    sla = contract.get_sla(sla_id)

    vm.sender = provider
    vm.value = int(sla["escrow_wei"])
    contract.lock_provider_escrow(sla_id)
    vm.value = 0

    vm.sender = customer
    vm.value = int(sla["bond_wei"])
    contract.co_sign_and_lock_bond(sla_id, sla["source_digest"])
    vm.value = 0

    return contract.get_sla(sla_id)


def mock_all_sources_report(vm, minutes: int, sources=None):
    """Mocks every default evidence source's web fetch AND the LLM
    extraction step to agree on `minutes` of downtime — the common
    "everyone agrees" consensus path."""
    for url in sources or DEFAULT_SOURCES:
        vm.mock_web(re_escape_ish(url), {"status": 200, "body": '{"status":"ok"}'})
    vm.mock_llm(r".*", json.dumps({"breach_minutes": minutes, "confidence": "high"}))


def re_escape_ish(url: str) -> str:
    import re
    return re.escape(url)
