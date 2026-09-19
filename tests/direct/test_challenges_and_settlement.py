"""Challenges, finalization/fund-movement, withdrawal, and the Equivalence
Principle's actual validator-disagreement behavior."""
import json
from conftest import (
    GEN,
    DEFAULT_SOURCES,
    propose_default_sla,
    activate_default_sla,
    mock_all_sources_report,
    hexaddr,
)

ADDITIONAL_SOURCE = "https://discordstatus.com/api/v2/summary.json"


def _resolved_no_breach_claim(direct_vm, direct_deploy, provider, customer, window_seconds=60):
    # NOTE: breach_minutes gets defensively clamped to [0, window_minutes]
    # (see _coerce_breach_minutes) — a window shorter than the breach
    # figure you want to test with will silently clamp it down. Callers
    # exercising anything beyond a trivial 0/1-minute result should pass a
    # window_seconds large enough to hold it (e.g. 3600 for up to 60 min).
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, provider, customer)
    sla = activate_default_sla(contract, direct_vm, provider, customer, sla_id)
    start = int(sla["term_start_ts"]) + 60

    direct_vm.sender = customer
    claim_id = contract.submit_claim(sla_id, start, start + window_seconds)

    mock_all_sources_report(direct_vm, minutes=0)
    contract.evaluate_claim(claim_id)
    return contract, sla_id, claim_id, sla


def test_only_a_party_to_the_sla_can_file_a_challenge(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_charlie
    direct_vm.value = int(sla["challenge_bond_wei"])
    with direct_vm.expect_revert("Only a party to the SLA"):
        contract.file_challenge(claim_id, [ADDITIONAL_SOURCE], "not a party, should fail")


def test_challenge_requires_exact_bond_value(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    direct_vm.value = 1 * GEN  # not the agreed challenge_bond_wei (2,500 GEN)
    with direct_vm.expect_revert("must exactly match the SLA's challenge_bond_wei"):
        contract.file_challenge(claim_id, [ADDITIONAL_SOURCE], "wrong bond amount")


def test_challenge_cannot_duplicate_a_pinned_source(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    direct_vm.value = int(sla["challenge_bond_wei"])
    with direct_vm.expect_revert("duplicates an already-pinned source"):
        contract.file_challenge(claim_id, [DEFAULT_SOURCES[0]], "trying to re-add an original source")


def test_challenge_upheld_slashes_bond_to_counterparty(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_bob  # customer challenges
    direct_vm.value = int(sla["challenge_bond_wei"])
    challenge_id = contract.file_challenge(claim_id, [ADDITIONAL_SOURCE], "requesting re-adjudication")

    # Re-mock the (now expanded) source set to still agree on 0 minutes —
    # the challenge should be upheld-original.
    direct_vm.clear_mocks()
    mock_all_sources_report(direct_vm, minutes=0, sources=DEFAULT_SOURCES + [ADDITIONAL_SOURCE])
    contract.resolve_challenge(challenge_id)

    challenge = contract.get_challenge(challenge_id)
    assert challenge["resolved"] is True
    assert challenge["outcome"] == "UPHELD_ORIGINAL"

    claim = contract.get_claim(claim_id)
    assert claim["is_challenged"] is False

    # Customer (challenger) loses the bond to the provider (counterparty).
    assert contract.get_withdrawable_balance(hexaddr(direct_alice)) == str(int(sla["challenge_bond_wei"]))
    assert contract.get_withdrawable_balance(hexaddr(direct_bob)) == "0"


def test_challenge_overturned_recomputes_settlement_and_refunds_challenger(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    # 3600s window so a 30-minute agreed breach isn't clamped down by the
    # window-length cap (see _resolved_no_breach_claim's note).
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(
        direct_vm, direct_deploy, direct_alice, direct_bob, window_seconds=3600
    )

    direct_vm.sender = direct_bob
    direct_vm.value = int(sla["challenge_bond_wei"])
    challenge_id = contract.file_challenge(claim_id, [ADDITIONAL_SOURCE], "new evidence shows a real incident")

    # This time the expanded source set agrees on a real breach (30 min,
    # well over the 21-minute grace) — the original NO_BREACH verdict
    # should be overturned. clear_mocks() first: the original minutes=0
    # mocks are still registered and would otherwise still match first.
    direct_vm.clear_mocks()
    mock_all_sources_report(direct_vm, minutes=30, sources=DEFAULT_SOURCES + [ADDITIONAL_SOURCE])
    contract.resolve_challenge(challenge_id)

    challenge = contract.get_challenge(challenge_id)
    assert challenge["outcome"] == "OVERTURNED"

    claim = contract.get_claim(claim_id)
    assert claim["status"] in ("RESOLVED_BREACH", "RESOLVED_PARTIAL")
    assert claim["breach_minutes"] == 30
    assert int(claim["payout_wei"]) > 0

    # Challenger (customer) gets their bond back, not slashed.
    assert contract.get_withdrawable_balance(hexaddr(direct_bob)) == str(int(sla["challenge_bond_wei"]))


def test_cannot_finalize_before_challenge_window_closes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    with direct_vm.expect_revert("Challenge window has not closed"):
        contract.finalize_claim(claim_id)


def test_cannot_finalize_while_challenge_is_pending(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.sender = direct_bob
    direct_vm.value = int(sla["challenge_bond_wei"])
    contract.file_challenge(claim_id, [ADDITIONAL_SOURCE], "pending challenge blocks finalize")

    direct_vm.warp("2099-01-01T00:00:00Z")  # force well past any deadline
    with direct_vm.expect_revert("challenge is still pending"):
        contract.finalize_claim(claim_id)


def test_finalize_no_breach_slashes_bond_to_provider_and_returns_escrow(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)

    direct_vm.warp("2099-01-01T00:00:00Z")  # past the 72h challenge window
    contract.finalize_claim(claim_id)

    claim = contract.get_claim(claim_id)
    assert claim["finalized"] is True

    # NO_BREACH: provider gets escrow back AND the customer's forfeited bond.
    provider_balance = int(contract.get_withdrawable_balance(hexaddr(direct_alice)))
    assert provider_balance == int(sla["escrow_wei"]) + int(sla["bond_wei"])
    assert contract.get_withdrawable_balance(hexaddr(direct_bob)) == "0"

    sla_after = contract.get_sla(sla_id)
    assert sla_after["escrow_deposited"] == "0"
    assert sla_after["bond_deposited"] == "0"
    assert sla_after["active_claim_id"] == ""
    assert len(sla_after["adjudicated_windows"]) == 1


def test_cannot_finalize_the_same_claim_twice(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.warp("2099-01-01T00:00:00Z")
    contract.finalize_claim(claim_id)

    with direct_vm.expect_revert("already been finalized"):
        contract.finalize_claim(claim_id)


def test_cannot_reclaim_the_same_adjudicated_window_twice(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.warp("2099-01-01T00:00:00Z")
    contract.finalize_claim(claim_id)

    start = int(sla["term_start_ts"]) + 60  # same window as the finalized claim
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("overlaps a window already adjudicated"):
        contract.submit_claim(sla_id, start, start + 60)


def test_withdraw_zero_balance_reverts(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("No withdrawable balance"):
        contract.withdraw()


def test_withdraw_pays_out_and_zeroes_the_ledger_first(direct_vm, direct_deploy, direct_alice, direct_bob):
    # NOTE: direct mode does not simulate the external GEN transfer itself
    # (the ghost-contract EthSend that _send_gen ultimately triggers isn't
    # modeled — it shows up as an unhandled gl_call trace, not a balance
    # change). What IS fully testable at the contract level, and is the
    # actual safety property that matters, is that the withdrawable ledger
    # is read and zeroed BEFORE `withdraw()` completes — which is exactly
    # what closes the reentrancy window. A real GEN transfer is verified
    # live against the deployed contract (see MEMORY.md's live-verification
    # log), not here.
    contract, sla_id, claim_id, sla = _resolved_no_breach_claim(direct_vm, direct_deploy, direct_alice, direct_bob)
    direct_vm.warp("2099-01-01T00:00:00Z")
    contract.finalize_claim(claim_id)

    expected = str(int(sla["escrow_wei"]) + int(sla["bond_wei"]))
    assert contract.get_withdrawable_balance(hexaddr(direct_alice)) == expected

    direct_vm.sender = direct_alice
    contract.withdraw()

    assert contract.get_withdrawable_balance(hexaddr(direct_alice)) == "0"  # zeroed

    # Second withdraw with nothing left must revert, not silently no-op —
    # this is what makes double-withdraw structurally impossible.
    with direct_vm.expect_revert("No withdrawable balance"):
        contract.withdraw()


def test_equivalence_principle_rejects_a_validator_that_disagrees_beyond_tolerance(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    """
    This is the load-bearing test for Contract Quality: it proves the
    validator function actually RE-DERIVES the answer and compares it to
    the leader's, rather than trusting the leader's output verbatim. We
    run the leader with sources agreeing on 0 minutes, then force
    run_validator() to see a world where independent re-fetch would yield
    60 minutes (swap the LLM mock before calling run_validator) — the
    validator must reject (return False) because 60 is outside the SLA's
    ±2 minute tolerance.
    """
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)
    sla = activate_default_sla(contract, direct_vm, direct_alice, direct_bob, sla_id)
    start = int(sla["term_start_ts"]) + 60

    # 3600s window: breach_minutes is defensively clamped to
    # [0, window_minutes] (see _coerce_breach_minutes), so a 1-minute
    # window would silently clamp a "60 minute disagreement" down to 1
    # and this test would pass for the wrong reason.
    direct_vm.sender = direct_bob
    claim_id = contract.submit_claim(sla_id, start, start + 3600)

    # Leader sees breach_minutes = 0 across all sources.
    mock_all_sources_report(direct_vm, minutes=0)
    contract.evaluate_claim(claim_id)

    # A validator disagreeing wildly (60 min, outside ±2 tolerance) must
    # be rejected by the captured validator_fn.
    direct_vm.clear_mocks()
    mock_all_sources_report(direct_vm, minutes=60)
    agreed = direct_vm.run_validator()
    assert agreed is False

    # A validator agreeing within tolerance (1 min, inside ±2) must pass.
    direct_vm.clear_mocks()
    mock_all_sources_report(direct_vm, minutes=1)
    agreed_within_tolerance = direct_vm.run_validator()
    assert agreed_within_tolerance is True
