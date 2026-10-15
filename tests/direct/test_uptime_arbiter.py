"""GenLayer Direct Mode lifecycle and adversarial-consensus tests.

Direct Mode executes the contract's actual storage/state machine. The explicit
equivalence-predicate tests exercise the same pure predicate invoked by every
validator and prove that well-formed but fabricated leader output is rejected.
"""
import datetime
import json

CONTRACT = "contracts/UptimeArbiter.py"
TERMS_HASH = "0x" + "ab" * 32
SOURCES = [
    "https://status.example/a.json",
    "https://status.example/b.json",
    "https://status.example/c.json",
]


def _now(direct_vm):
    return int(datetime.datetime.fromisoformat(direct_vm._datetime.replace("Z", "+00:00")).timestamp())


def _warp(direct_vm, seconds):
    target = _now(direct_vm) + seconds
    direct_vm.warp(datetime.datetime.fromtimestamp(target, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z"))


def _register(contract, direct_vm, provider, customer, agreement_id=1, sources=SOURCES, service="api.example.com production API"):
    current = _now(direct_vm)
    direct_vm.sender = provider
    return contract.register_adjudication(
        agreement_id,
        int(TERMS_HASH, 16),
        customer,
        "Production API",
        service,
        9990,
        "10000",
        "1000000",
        "200000",
        current - 7200,
        current + 3600,
        current + 7200,
        current + 14400,
        300,
        600,
        sources,
        "Maintenance announced at least 24 hours before the window is excluded.",
        12345,
    )


def _activate_and_claim(contract, direct_vm, provider, customer, sources=SOURCES, service="api.example.com production API"):
    sla_id = _register(contract, direct_vm, provider, customer, sources=sources, service=service)
    direct_vm.sender = customer
    contract.record_base_funding(sla_id, "CUSTOMER", 23456)
    current = _now(direct_vm)
    claim_id = contract.submit_claim(sla_id, current - 1800, current - 600)
    return sla_id, claim_id


def _report(*, minutes=10, relevant=True, service_match=True, excluded=False, start=1000, end=1600):
    return {
        "source_url": "https://status.example/a.json",
        "source_fingerprint_sha256": "a" * 64,
        "usable": True,
        "source_relevant": relevant,
        "covered_service_match": service_match,
        "source_summary": "API disruption",
        "incidents": [{
            "start_ts": start,
            "end_ts": end,
            "service": "api.example.com production API",
            "summary": "Elevated errors",
            "quotation": "Investigating elevated API error rates.",
            "excluded": excluded,
            "exclusion_reason": "" if not excluded else "scheduled maintenance",
        }],
        "breach_minutes": minutes,
    }


def _evaluation(report, minutes=10):
    reports = []
    for index in range(3):
        item = dict(report)
        item["source_url"] = SOURCES[index]
        item["incidents"] = [dict(report["incidents"][0])]
        reports.append(item)
    return {"reports": reports, "breach_minutes": minutes}


def test_unique_base_agreement_binding(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _register(contract, direct_vm, direct_alice, direct_bob, 7)
    with direct_vm.expect_revert():
        _register(contract, direct_vm, direct_alice, direct_bob, 7)


def test_unrelated_sender_cannot_reserve_base_id_against_provider(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    # A malicious wallet can submit a record, but its reservation is scoped to
    # itself. It cannot consume the Base ID globally and block the provider's
    # independently authenticated record from reaching the backend.
    _register(contract, direct_vm, direct_bob, direct_alice, 19)
    legitimate = _register(contract, direct_vm, direct_alice, direct_bob, 19)
    assert legitimate == "SLA-2"


def test_future_or_unpublished_claim_window_rejected(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    sla_id = _register(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.sender = direct_bob
    contract.record_base_funding(sla_id, "CUSTOMER", 23456)
    current = _now(direct_vm)
    with direct_vm.expect_revert():
        contract.submit_claim(sla_id, current - 60, current + 600)
    with direct_vm.expect_revert():
        contract.submit_claim(sla_id, current - 600, current - 100)  # publication lag incomplete


def test_completed_claim_evaluates_challenges_and_finalizes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _, claim_id = _activate_and_claim(contract, direct_vm, direct_alice, direct_bob)
    direct_vm.mock_web(r".*status\.example.*", {"status": 200, "body": "Production API incident 10 minutes, 2026-10-15T00:00Z"})
    direct_vm.mock_llm(r".*independently auditing.*", json.dumps({
        "usable": True,
        "source_relevant": True,
        "covered_service_match": True,
        "source_summary": "Production API incident",
        "incidents": [],
    }))
    contract.evaluate_claim(claim_id)
    claim = contract.get_claim(claim_id)
    assert claim["status"] == "PROVISIONAL_NO_BREACH"
    assert claim["evidence_digest"].startswith("0x")

    direct_vm.sender = direct_alice
    contract.file_challenge(claim_id, ["https://status.example/provider-incident.json"], "Provider incident archive adds the timestamped resolution record.")
    assert contract.get_claim(claim_id)["status"] == "CHALLENGED"
    contract.resolve_challenge(claim_id)
    deadline = int(contract.get_claim(claim_id)["challenge_deadline_ts"])
    _warp(direct_vm, deadline - _now(direct_vm))
    contract.finalize_claim(claim_id)
    assert contract.get_claim(claim_id)["status"] == "FINALIZED_NO_BREACH"


def test_validator_rejects_fabricated_breach_minutes(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    honest = _evaluation(_report(minutes=10), 10)
    fabricated = _evaluation(_report(minutes=10), 900)
    assert contract.verify_evaluation_equivalence(json.dumps(fabricated), json.dumps(honest)) is False


def test_validator_rejects_wrong_service_relevance(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    honest = _evaluation(_report(minutes=10), 10)
    unrelated = _evaluation(_report(minutes=10, service_match=False), -1)
    assert contract.verify_evaluation_equivalence(json.dumps(unrelated), json.dumps(honest)) is False


def test_validator_rejects_maintenance_exclusion_disagreement(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    included = _evaluation(_report(minutes=10, excluded=False), 10)
    excluded = _evaluation(_report(minutes=10, excluded=True), 10)
    assert contract.verify_evaluation_equivalence(json.dumps(excluded), json.dumps(included)) is False


def test_validator_rejects_different_incident_period(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    honest = _evaluation(_report(minutes=10, start=1000, end=1600), 10)
    shifted = _evaluation(_report(minutes=10, start=5000, end=5600), 10)
    assert contract.verify_evaluation_equivalence(json.dumps(shifted), json.dumps(honest)) is False


def test_validator_rejects_payout_sensitive_minute_variance(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    left = _evaluation(_report(minutes=10, start=1000, end=1600), 10)
    right = _evaluation(_report(minutes=12, start=1100, end=1700), 12)
    assert contract.verify_evaluation_equivalence(json.dumps(left), json.dumps(right)) is False


def test_validator_accepts_harmless_page_fingerprint_change_but_rejects_quote_change(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT)
    left = _evaluation(_report(minutes=10), 10)
    harmless = json.loads(json.dumps(left))
    for report in harmless["reports"]:
        report["source_fingerprint_sha256"] = "b" * 64
    assert contract.verify_evaluation_equivalence(json.dumps(left), json.dumps(harmless)) is True

    material = json.loads(json.dumps(left))
    material["reports"][0]["incidents"][0]["quotation"] = "A different incident fact."
    assert contract.verify_evaluation_equivalence(json.dumps(left), json.dumps(material)) is False


def test_overlapping_incidents_do_not_double_count_payable_minutes(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    _, claim_id = _activate_and_claim(contract, direct_vm, direct_alice, direct_bob)
    claim = contract.get_claim(claim_id)
    start = int(claim["window_start_ts"])
    body = "Confirmed API disruption from the public status archive."
    direct_vm.mock_web(r".*status\.example.*", {"status": 200, "body": body})
    direct_vm.mock_llm(r".*independently auditing.*", json.dumps({
        "usable": True,
        "source_relevant": True,
        "covered_service_match": True,
        "source_summary": "Status archive",
        "incidents": [
            {"start_ts": start, "end_ts": start + 600, "service": "api.example.com production API", "summary": "Parent incident", "quotation": body, "excluded": False, "exclusion_reason": ""},
            {"start_ts": start + 300, "end_ts": start + 900, "service": "api.example.com production API", "summary": "Component incident", "quotation": body, "excluded": False, "exclusion_reason": ""},
        ],
    }))
    contract.evaluate_claim(claim_id)
    assert contract.get_claim(claim_id)["breach_minutes"] == 15


def test_github_status_json_yields_verifiable_actions_minutes_without_llm(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    sources = [
        "https://www.githubstatus.com/api/v2/incidents.json",
        "https://www.githubstatus.com/api/v2/incidents.json?view=archive",
        "https://www.githubstatus.com/api/v2/incidents.json?view=timeline",
    ]
    _, claim_id = _activate_and_claim(
        contract, direct_vm, direct_alice, direct_bob,
        sources=sources, service="GitHub Actions hosted runners",
    )
    claim = contract.get_claim(claim_id)
    start = int(claim["window_start_ts"])
    incident = {
        "incidents": [{
            "name": "Incident with Actions",
            "created_at": datetime.datetime.fromtimestamp(start + 60, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "resolved_at": datetime.datetime.fromtimestamp(start + 660, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "components": [{"name": "Actions"}],
            "incident_updates": [
                {"status": "investigating", "created_at": datetime.datetime.fromtimestamp(start + 60, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")},
                {"status": "resolved", "created_at": datetime.datetime.fromtimestamp(start + 660, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")},
            ],
        }],
        # Archive payloads are routinely larger than the semantic prompt cap.
        # The deterministic extractor must parse the complete JSON rather than
        # attempting json.loads() on a truncated document.
        "archive_padding": "x" * 13000,
    }
    direct_vm.mock_web(r".*githubstatus\.com/api/v2/incidents.*", {"status": 200, "body": json.dumps(incident)})
    contract.evaluate_claim(claim_id)
    evaluated = contract.get_claim(claim_id)
    assert evaluated["breach_minutes"] == 10
    assert "Incident with Actions" in evaluated["evidence_report_json"]


def test_github_status_uses_actual_update_interval_and_excludes_announced_maintenance(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    sources = [
        "https://www.githubstatus.com/api/v2/incidents.json",
        "https://www.githubstatus.com/api/v2/incidents.json?view=archive",
        "https://www.githubstatus.com/api/v2/incidents.json?view=timeline",
    ]
    _, claim_id = _activate_and_claim(contract, direct_vm, direct_alice, direct_bob, sources=sources, service="GitHub Actions hosted runners")
    start = int(contract.get_claim(claim_id)["window_start_ts"])
    ts = lambda seconds: datetime.datetime.fromtimestamp(start + seconds, tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {"incidents": [
        {"name": "Actions impairment", "created_at": ts(5), "resolved_at": ts(1000), "components": [{"name": "Actions"}], "incident_updates": [
            {"status": "investigating", "created_at": ts(100)}, {"status": "monitoring", "created_at": ts(400)}]},
        # This maintenance occurs inside the claimed observation window. It was
        # announced more than 24 hours earlier and must be excluded even though
        # the contract prose does not contain the exact phrase "scheduled maintenance".
        {"name": "Actions maintenance window", "created_at": ts(-90000), "scheduled_for": ts(300), "components": [{"name": "Actions"}], "incident_updates": [
            {"status": "scheduled", "created_at": ts(-90000)}, {"status": "investigating", "created_at": ts(300)}, {"status": "resolved", "created_at": ts(900)}]},
    ]}
    direct_vm.mock_web(r".*githubstatus\.com/api/v2/incidents.*", {"status": 200, "body": json.dumps(payload)})
    contract.evaluate_claim(claim_id)
    # Count the authoritative impairment update interval (300 seconds = 5m),
    # never the broad created/resolved envelope or excluded maintenance.
    assert contract.get_claim(claim_id)["breach_minutes"] == 5


def test_spoofed_github_status_url_never_activates_deterministic_parser(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    sources = [
        "https://githubstatus.com.evil.example/api/v2/incidents.json",
        "https://githubstatus.com.evil.example/api/v2/incidents.json?copy=2",
        "https://githubstatus.com.evil.example/api/v2/incidents.json?copy=3",
    ]
    _, claim_id = _activate_and_claim(contract, direct_vm, direct_alice, direct_bob, sources=sources, service="GitHub Actions hosted runners")
    direct_vm.mock_web(r".*evil\.example.*", {"status": 200, "body": json.dumps({"incidents": []})})
    contract.evaluate_claim(claim_id)
    assert contract.get_claim(claim_id)["status"] == "PROVISIONAL_INCONCLUSIVE"
