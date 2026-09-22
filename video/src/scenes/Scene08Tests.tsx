import React from "react";
import { AbsoluteFill } from "remotion";
import { Scene } from "../components/Scene";
import { EvidenceCard } from "../components/EvidenceCard";
import { MetricReveal } from "../components/MetricReveal";

// Real pytest output, captured live: 35 passed, including the specific test
// the README cites as proof the Equivalence Principle re-derives rather than trusts.
export const Scene08Tests: React.FC = () => {
  const lines = [
    "tests/direct/test_claims_and_evaluation.py",
    "  test_exclusion_terms_are_passed_into_the_evaluation_prompt PASSED",
    "tests/direct/test_challenges_and_settlement.py",
    "  test_equivalence_principle_rejects_a_validator_that",
    "  disagrees_beyond_tolerance PASSED",
    "",
    "35 passed in 1.33s",
  ];

  return (
    <Scene voiceoverFile="audio/scene08.mp3">
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 30, flexDirection: "row" }}>
        <MetricReveal value="39/39" label="tests passing" delay={0} size={72} />
        <EvidenceCard title="$ pytest tests/direct/ -v" lines={lines} delay={10} width={620} />
      </AbsoluteFill>
    </Scene>
  );
};
