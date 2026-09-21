"""Claim submission, independent-evidence evaluation, and settlement math."""
import json
from conftest import (
    GEN,
    DEFAULT_SOURCES,
    propose_default_sla,
    activate_default_sla,
    mock_all_sources_report,
    mock_sources_mixed,
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


def test_covered_service_is_passed_into_the_evaluation_prompt(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """covered_service is pinned so a status page listing several services
    can't have an unrelated incident miscounted against this SLA — assert
    it actually reaches the prompt each validator reasons over."""
    contract, sla_id, sla = _active_sla(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        covered_service="Checkout API (payments-eu-west)",
    )
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 60)

    for url in DEFAULT_SOURCES:
        direct_vm.mock_web(url.replace(".", r"\."), {"status": 200, "body": "{}"})
    # Only matches if the pinned covered_service string was actually
    # interpolated into the prompt — if the contract failed to thread it
    # through, no mock matches and evaluation falls through to
    # INCONCLUSIVE instead of RESOLVED_NO_BREACH.
    direct_vm.mock_llm(
        r".*Checkout API \(payments-eu-west\).*",
        json.dumps({"usable": True, "breach_minutes": 0, "confidence": "high"}),
    )

    contract.evaluate_claim(claim_id)
    assert contract.get_claim(claim_id)["status"] == "RESOLVED_NO_BREACH"


def test_target_uptime_bps_materially_changes_settlement(direct_vm, direct_deploy, direct_alice, direct_bob):
    """
    Regression test for a real soundness gap: target_uptime_bps used to be
    stored but never actually used anywhere — grace_minutes was a fully
    independent free-form input, so a provider/customer could agree to a
    99.99% target while separately setting an enormous grace_minutes,
    making the stated target purely decorative. grace_minutes is now
    DERIVED from target_uptime_bps + term_seconds, so the same term length
    with a stricter vs. laxer target must produce different derived grace
    budgets and, for an identical agreed breach, different verdicts.
    """
    contract = direct_deploy("contracts/UptimeArbiter.py")

    strict_id = propose_default_sla(
        contract, direct_vm, direct_alice, direct_bob, target_uptime_bps=9999  # 99.99%
    )
    lenient_id = propose_default_sla(
        contract, direct_vm, direct_alice, direct_bob, target_uptime_bps=9900  # 99%
    )

    strict_sla = contract.get_sla(strict_id)
    lenient_sla = contract.get_sla(lenient_id)

    # 30-day term = 43,200 minutes. 99.99% -> grace = 43200 * 0.0001 = 4.32 -> 4.
    # 99% -> grace = 43200 * 0.01 = 432.
    assert strict_sla["grace_minutes"] == 4
    assert lenient_sla["grace_minutes"] == 432

    strict_sla = activate_default_sla(contract, direct_vm, direct_alice, direct_bob, strict_id)
    lenient_sla = activate_default_sla(contract, direct_vm, direct_alice, direct_bob, lenient_id)

    start = int(strict_sla["term_start_ts"]) + 60
    direct_vm.sender = direct_bob
    strict_claim = contract.submit_claim(strict_id, start, start + 3600)
    lenient_claim = contract.submit_claim(lenient_id, start, start + 3600)

    # Both SLAs see the IDENTICAL agreed evidence: 60 minutes of downtime.
    mock_all_sources_report(direct_vm, minutes=60)
    contract.evaluate_claim(strict_claim)
    direct_vm.clear_mocks()
    mock_all_sources_report(direct_vm, minutes=60)
    contract.evaluate_claim(lenient_claim)

    strict_result = contract.get_claim(strict_claim)
    lenient_result = contract.get_claim(lenient_claim)

    # Strict target: 60 - 4 = 56 billable minutes -> a real payout.
    assert strict_result["status"] in ("RESOLVED_BREACH", "RESOLVED_PARTIAL")
    assert int(strict_result["payout_wei"]) > 0

    # Lenient target: 60 minutes is fully inside the 432-minute grace budget.
    assert lenient_result["status"] == "RESOLVED_NO_BREACH"
    assert lenient_result["payout_wei"] == "0"


def test_unusable_sources_excluded_from_quorum_not_counted_as_zero(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """
    Regression test for a real soundness gap: a source the model could not
    confidently attribute to the covered service (or read at all) used to
    be coerced to "0 breach minutes" — indistinguishable from "confirmed no
    incident" — which could let 2 unrelated/unusable sources plus 1 real
    reading falsely reach majority quorum and resolve NO_BREACH, when only
    a MINORITY of sources actually said anything usable. It must resolve
    INCONCLUSIVE instead.
    """
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 3600)

    # 1 usable source (reports a real 30-minute incident) + 2 unusable
    # (fetched fine, but content is unrelated / low-confidence). Required
    # majority of 3 is 2 — only 1 source is actually usable, so this must
    # NOT reach quorum, regardless of what number the unusable ones might
    # otherwise have been coerced to.
    mock_sources_mixed(
        direct_vm,
        usable_minutes={DEFAULT_SOURCES[0]: 30},
        unusable_urls=[DEFAULT_SOURCES[1], DEFAULT_SOURCES[2]],
    )

    contract.evaluate_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["status"] == "INCONCLUSIVE"
    assert claim["inconclusive_reason"] != ""
    assert claim["breach_minutes"] == 0
    # SLA must be reopened for a new claim attempt, not stuck on a
    # falsely-quorate result.
    assert contract.get_sla(sla_id)["active_claim_id"] == ""


def test_unusable_sources_still_reach_quorum_when_majority_is_usable(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """Complement to the test above: 2 usable + 1 unusable out of 3 DOES
    meet the majority requirement, and the aggregate is computed only from
    the 2 usable readings — the unusable one contributes nothing, not a 0."""
    contract, sla_id, sla = _active_sla(direct_vm, direct_deploy, direct_alice, direct_bob)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 3600)

    mock_sources_mixed(
        direct_vm,
        usable_minutes={DEFAULT_SOURCES[0]: 40, DEFAULT_SOURCES[1]: 40},
        unusable_urls=[DEFAULT_SOURCES[2]],
    )

    contract.evaluate_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["status"] in ("RESOLVED_BREACH", "RESOLVED_PARTIAL")
    assert claim["breach_minutes"] == 40
