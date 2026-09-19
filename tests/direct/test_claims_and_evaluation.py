"""Claim submission, independent-evidence evaluation, and settlement math."""
import json
from conftest import (
    GEN,
    DEFAULT_SOURCES,
    propose_default_sla,
    activate_default_sla,
    mock_all_sources_report,
    hexaddr,
)


def _active_sla(direct_vm, direct_deploy, provider, customer, **kwargs):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, provider, customer, **kwargs)
    sla = activate_default_sla(contract, direct_vm, provider, customer, sla_id)
    return contract, sla_id, sla


def test_only_customer_can_submit_claim(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("Only the customer may submit"):
        contract.submit_claim(sla_id, int(sla["term_start_ts"]) + 60, int(sla["term_start_ts"]) + 120)


def test_claim_window_must_fall_within_term(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("must fall within the SLA's active term"):
        contract.submit_claim(sla_id, int(sla["term_start_ts"]) - 3600, int(sla["term_start_ts"]) - 60)


def test_cannot_open_second_claim_while_one_is_open(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    contract.submit_claim(sla_id, start, start + 60)

    with direct_vm.expect_revert("already has an open claim"):
        contract.submit_claim(sla_id, start + 120, start + 180)


def test_evaluate_claim_resolves_no_breach_when_all_sources_agree_zero(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 60)

    mock_all_sources_report(direct_vm, minutes=0)
    contract.evaluate_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["status"] == "RESOLVED_NO_BREACH"
    assert claim["breach_minutes"] == 0
    assert claim["payout_wei"] == "0"
    assert int(claim["challenge_deadline_ts"]) > 0


def test_evaluate_claim_resolves_partial_when_payout_is_below_full_escrow(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    # grace_minutes default is 21; penalty_rate default is 250 GEN/min.
    # A 60-minute window with all sources agreeing on 60 min downtime:
    # billable = 60 - 21 = 39 min -> 39 * 250 = 9,750 GEN. Per
    # _compute_settlement, RESOLVED_BREACH is reserved for payouts that
    # consume the FULL escrow; anything below that (however large the
    # breach) is RESOLVED_PARTIAL with the corresponding bps.
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 3600)

    mock_all_sources_report(direct_vm, minutes=60)
    contract.evaluate_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["status"] == "RESOLVED_PARTIAL"
    assert claim["breach_minutes"] == 60
    assert claim["payout_wei"] == str(39 * 250 * GEN)
    assert claim["recommended_payout_bps"] == (39 * 250 * GEN * 10_000) // (50_000 * GEN)


def test_evaluate_claim_payout_caps_at_escrow_balance(direct_vm, direct_deploy, direct_alice, direct_bob):
    # 250 GEN/min * (600 - 21) min = 144,750 GEN, which exceeds the 50,000
    # GEN escrow — payout must cap there, not overflow the vault.
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 600 * 60)

    mock_all_sources_report(direct_vm, minutes=600)
    contract.evaluate_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["status"] == "RESOLVED_BREACH"
    assert claim["payout_wei"] == str(50_000 * GEN)  # capped at full escrow


def test_evaluate_claim_below_grace_period_resolves_no_breach(direct_vm, direct_deploy, direct_alice, direct_bob):
    # grace_minutes = 21; a 10-minute agreed breach is fully inside grace.
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 600)

    mock_all_sources_report(direct_vm, minutes=10)
    contract.evaluate_claim(claim_id)

    assert contract.get_claim(claim_id)["status"] == "RESOLVED_NO_BREACH"


def test_evaluate_claim_inconclusive_when_majority_of_sources_unreachable(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 60)

    # Only mock 1 of 3 sources — gl.nondet.web.get on the other two will
    # hit the real network from this sandbox and fail/hang; instead mock
    # them as unreachable by NOT registering a mock (unmocked -> the
    # contract's own fallback chain raises, treated as unreachable). With
    # strict "no live network" behavior in direct mode, an unmatched URL
    # mock raises inside _fetch_source_text, which the pipeline already
    # treats as an unreachable source (-1 sentinel).
    direct_vm.mock_web(DEFAULT_SOURCES[0].replace(".", r"\."), {"status": 200, "body": "{}"})
    direct_vm.mock_llm(r".*", json.dumps({"breach_minutes": 0, "confidence": "high"}))

    contract.evaluate_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["status"] == "INCONCLUSIVE"
    assert claim["inconclusive_reason"] != ""
    # SLA must be reopened for a new claim attempt, not stuck.
    assert contract.get_sla(sla_id)["active_claim_id"] == ""


def test_cannot_evaluate_an_already_resolved_claim(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 60)
    mock_all_sources_report(direct_vm, minutes=0)
    contract.evaluate_claim(claim_id)

    with direct_vm.expect_revert("already been evaluated"):
        contract.evaluate_claim(claim_id)


def test_exclusion_terms_are_passed_into_the_evaluation_prompt(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """The whole point of exclusion_terms (see GenLayer-fit writeup in the
    contract header) is that it's threaded into the prompt each validator
    reasons over — assert it actually reaches gl.nondet.exec_prompt."""
    contract, sla_id, sla = _active_sla(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        exclusion_terms="Pre-announced maintenance windows (>=24h notice) do not count as breach.",
    )
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 60)

    for url in DEFAULT_SOURCES:
        direct_vm.mock_web(url.replace(".", r"\."), {"status": 200, "body": "{}"})
    # Only match prompts that actually contain the pinned exclusion text —
    # if the contract failed to interpolate it, no mock matches and the
    # LLM call falls through to unmocked (raising), which would turn this
    # into INCONCLUSIVE instead of RESOLVED_NO_BREACH.
    direct_vm.mock_llm(
        r".*Pre-announced maintenance windows.*",
        json.dumps({"breach_minutes": 0, "confidence": "high", "excluded": True}),
    )

    contract.evaluate_claim(claim_id)
    assert contract.get_claim(claim_id)["status"] == "RESOLVED_NO_BREACH"
