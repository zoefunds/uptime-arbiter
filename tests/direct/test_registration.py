"""Registration + escrow-activation lifecycle (propose -> fund -> co-sign)."""
import json
from conftest import GEN, propose_default_sla, activate_default_sla, DEFAULT_SOURCES, hexaddr


def test_propose_sla_stores_correct_terms(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)

    sla = contract.get_sla(sla_id)
    assert sla["sla_id"] == "SLA-1"
    assert sla["status"] == "PROPOSED"
    assert sla["provider_funded"] is False
    assert sla["customer_signed"] is False
    assert sla["evidence_sources"] == DEFAULT_SOURCES
    assert sla["escrow_deposited"] == "0"
    assert len(sla["source_digest"]) == 16  # FNV-1a hex fingerprint


def test_provider_and_customer_must_differ(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    with direct_vm.expect_revert("Provider and customer must differ"):
        propose_default_sla(contract, direct_vm, direct_alice, direct_alice)


def test_requires_minimum_three_evidence_sources(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    with direct_vm.expect_revert("evidence_sources must contain"):
        propose_default_sla(contract, direct_vm, direct_alice, direct_bob, sources=[
            "https://a.example.com/status.json",
            "https://b.example.com/status.json",
        ])


def test_rejects_duplicate_evidence_sources(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    dup = DEFAULT_SOURCES[0]
    with direct_vm.expect_revert("duplicate evidence source"):
        propose_default_sla(contract, direct_vm, direct_alice, direct_bob, sources=[dup, dup, DEFAULT_SOURCES[1]])


def test_rejects_escrow_below_protocol_minimum(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    with direct_vm.expect_revert("escrow_wei below protocol minimum"):
        propose_default_sla(contract, direct_vm, direct_alice, direct_bob, escrow_wei=0)


def test_rejects_challenge_bond_below_minimum_bps(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    # 5% of a 50,000 GEN escrow is 2,500 GEN; 1 GEN is far under that floor.
    with direct_vm.expect_revert("challenge_bond_wei must be at least"):
        propose_default_sla(contract, direct_vm, direct_alice, direct_bob, challenge_bond_wei=1 * GEN)


def test_only_provider_can_lock_escrow(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)
    sla = contract.get_sla(sla_id)

    direct_vm.sender = direct_charlie
    direct_vm.value = int(sla["escrow_wei"])
    with direct_vm.expect_revert("Only the proposing provider"):
        contract.lock_provider_escrow(sla_id)


def test_escrow_lock_requires_exact_value(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)

    direct_vm.sender = direct_alice
    direct_vm.value = 1 * GEN  # not the agreed 50,000 GEN
    with direct_vm.expect_revert("must exactly match"):
        contract.lock_provider_escrow(sla_id)


def test_co_sign_requires_matching_source_digest(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)
    sla = contract.get_sla(sla_id)

    direct_vm.sender = direct_bob
    direct_vm.value = int(sla["bond_wei"])
    with direct_vm.expect_revert("digest mismatch"):
        contract.co_sign_and_lock_bond(sla_id, "deadbeefdeadbeef")


def test_sla_activates_only_once_both_sides_fund(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)
    sla = contract.get_sla(sla_id)

    direct_vm.sender = direct_alice
    direct_vm.value = int(sla["escrow_wei"])
    contract.lock_provider_escrow(sla_id)

    # Provider funded, but customer hasn't co-signed yet — must still be PROPOSED.
    assert contract.get_sla(sla_id)["status"] == "PROPOSED"

    direct_vm.sender = direct_bob
    direct_vm.value = int(sla["bond_wei"])
    contract.co_sign_and_lock_bond(sla_id, sla["source_digest"])

    activated = contract.get_sla(sla_id)
    assert activated["status"] == "ACTIVE"
    assert int(activated["term_end_ts"]) > int(activated["term_start_ts"])


def test_cancel_before_activation_refunds_whichever_side_deposited(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)
    sla = contract.get_sla(sla_id)

    direct_vm.sender = direct_alice
    direct_vm.value = int(sla["escrow_wei"])
    contract.lock_provider_escrow(sla_id)
    direct_vm.value = 0

    direct_vm.sender = direct_alice
    contract.cancel_sla(sla_id)

    cancelled = contract.get_sla(sla_id)
    assert cancelled["status"] == "CANCELLED"
    assert cancelled["escrow_deposited"] == "0"  # zeroed on refund
    assert contract.get_withdrawable_balance(hexaddr(direct_alice)) == str(int(sla["escrow_wei"]))


def test_cannot_double_fund_provider_escrow(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/UptimeArbiter.py")
    sla_id = propose_default_sla(contract, direct_vm, direct_alice, direct_bob)
    sla = contract.get_sla(sla_id)

    direct_vm.sender = direct_alice
    direct_vm.value = int(sla["escrow_wei"])
    contract.lock_provider_escrow(sla_id)

    direct_vm.value = int(sla["escrow_wei"])
    with direct_vm.expect_revert("already locked"):
        contract.lock_provider_escrow(sla_id)
