import fixtures from "@shared/engine-fixtures.json";
import { describe, expect, it } from "vitest";
import { applyOutcome, detectMisconception, type EngineQuestion, evaluate, start } from "./engine";
import { parseAnswer } from "./hindiNumbers";

type Step = {
  outcome?: string;
  action?: string;
  next_question_id?: string | null;
  difficulty?: number;
  attempt?: number;
  suggest_manual?: boolean;
  mastery_signal?: boolean;
  start_question_id?: string;
};

describe("Hindi answer parser (shared fixtures)", () => {
  it.each(fixtures.parse)("parses %j", (c) => {
    const p = parseAnswer(c.text);
    expect([p.value, p.status]).toEqual([c.value, c.status]);
  });
});

describe("misconception detection (shared fixtures)", () => {
  it.each(fixtures.misconceptions)("classifies %j", (c) => {
    expect(detectMisconception(c.question as unknown as EngineQuestion, c.value)).toBe(c.code);
  });
});

describe("engine scenarios match the Python reference", () => {
  const qs = fixtures.questions as EngineQuestion[];
  it.each(fixtures.scenarios)("$name", (scenario) => {
    const steps = scenario.steps as Step[];
    const st = start(qs);
    expect(st.current_question_id).toBe(steps[0].start_question_id);
    for (const step of steps.slice(1)) {
      const d = applyOutcome(st, qs, step.outcome as "correct", null);
      expect(d.action).toBe(step.action);
      expect(d.next_question_id).toBe(step.next_question_id);
      expect(st.difficulty).toBe(step.difficulty);
      expect(st.attempt).toBe(step.attempt);
      expect(d.suggest_manual).toBe(step.suggest_manual);
      expect(d.mastery_signal).toBe(step.mastery_signal);
    }
  });

  it("never grades an unparsed answer as correct", () => {
    expect(evaluate(qs[0], null)).toEqual(["unclear", null]);
  });
});
