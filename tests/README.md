# Uptime Arbiter — Contract Tests

Direct-mode tests for `contracts/UptimeArbiter.py` — fast (~2.5s for all 35),
in-memory, no GenVM server or Docker required.

## Setup (one-time)

`genlayer-test` needs Python 3.12+ (a `collections.abc.Buffer` import fails
on 3.11 and earlier). If your default `python3`/`pip` resolve to an older
version, use a dedicated venv:

```bash
python3.12 -m venv .venv-tests
.venv-tests/bin/pip install genlayer-test
```

## Running

```bash
.venv-tests/bin/python3 -m pytest tests/direct/ -v
```

## Coverage

- **`test_registration.py`** — `propose_sla` validation (bounds, duplicate
  sources, provider≠customer), escrow/bond locking, exact-value enforcement,
  activation only once both sides fund, cancellation refunds.
- **`test_claims_and_evaluation.py`** — claim submission access control and
  window validation, the settlement math (no-breach / partial / capped-at-
  escrow), the majority-quorum `INCONCLUSIVE` path when sources are
  unreachable, and — the test backing the GenLayer Fit argument in the
  contract header — that `exclusion_terms` actually reaches the LLM prompt
  (asserted via an LLM mock that only matches if the pinned exclusion text
  was interpolated correctly).
- **`test_challenges_and_settlement.py`** — challenge access control and
  bond enforcement, both challenge outcomes (`UPHELD_ORIGINAL` slashes the
  challenger, `OVERTURNED` recomputes settlement and refunds them),
  finalize's fund-movement correctness and idempotency, double-claim /
  double-adjudication protection, and — the load-bearing test for Contract
  Quality — a direct proof that the Equivalence Principle validator
  actually **re-derives** the answer and rejects disagreement beyond
  tolerance, using `direct_vm.run_validator()` to independently re-run the
  captured validator function under different mocked evidence than the
  leader saw.

## A real gotcha this suite caught (in the tests, not the contract)

`breach_minutes` is defensively clamped to `[0, window_minutes]` in
`_coerce_breach_minutes` — a claim window of 60 seconds can never register
more than 1 minute of breach, no matter what an LLM mock returns. Two tests
initially failed for this reason (a "30-minute breach" and a "60-minute
disagreement" were both silently clamped to ~1 minute inside a 60-second
test window). That's the contract behaving correctly — the fix was in the
tests, not the contract: use a window (e.g. 3600s) wide enough to represent
the number you're actually trying to test. See the note on
`_resolved_no_breach_claim` in `test_challenges_and_settlement.py`.

## What direct mode does NOT cover

- Real multi-validator consensus rounds (direct mode runs one leader +
  lets you manually invoke the captured validator via `run_validator()`,
  which is enough to test the comparison logic, but not real network
  consensus/rotation behavior).
- The actual external GEN transfer `_send_gen` triggers (an `EthSend` via
  the ghost contract) — direct mode doesn't model chain-layer value
  transfer, so `withdraw()`'s ledger-zeroing is tested here, but the real
  GEN movement is only verified against the live deployed contract (see
  root `MEMORY.md`'s live-verification log from actual StudioNet usage).
- Real web fetches / real LLM behavior against live evidence sources —
  everything here uses `mock_web`/`mock_llm`. Live-network verification of
  the fetch pipeline was done manually against the real deployed contract
  (see `MEMORY.md`), not in this suite.
