import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CountingObjects2D } from "@/components/illustrations/CountingObjects2D";
import { LevelTally } from "@/components/ui/primitives";
import { PHRASES } from "../engine/engine";
import { NumberPad } from "./NumberPad";
import { StatusPanel } from "./StatusPanel";
import { phraseItems } from "./types";

describe("NumberPad", () => {
  it("submits the typed number and who entered it", async () => {
    const onSubmit = vi.fn();
    const onBy = vi.fn();
    render(<NumberPad onSubmit={onSubmit} by="manual" onByChange={onBy} />);
    await userEvent.click(screen.getByRole("button", { name: "1" }));
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByLabelText("Answer being entered")).toHaveTextContent("12");
    await userEvent.click(screen.getByRole("button", { name: "Delete last digit" }));
    await userEvent.click(screen.getByRole("button", { name: /भेजें/ }));
    expect(onSubmit).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole("radio", { name: "टोली-लीडर" }));
    expect(onBy).toHaveBeenCalledWith("leader");
  });

  it("cannot submit an empty answer", () => {
    render(<NumberPad onSubmit={vi.fn()} by="manual" onByChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /भेजें/ })).toBeDisabled();
  });
});

describe("StatusPanel", () => {
  it("says the microphone is off unless listening", () => {
    const { rerender } = render(<StatusPanel state="waiting" levels={[]} />);
    expect(screen.getByText(/Microphone is off/)).toBeInTheDocument();
    rerender(<StatusPanel state="listening" levels={[0.2, 0.5]} />);
    expect(screen.getByText(/Microphone is on/)).toBeInTheDocument();
    rerender(<StatusPanel state="speaking" levels={[]} />);
    expect(screen.queryByText(/Microphone is on/)).not.toBeInTheDocument();
  });
});

describe("feedback audio", () => {
  it("splits a feedback message into its recorded phrases", () => {
    expect(phraseItems(`${PHRASES.praise_1} ${PHRASES.harder}`).map((i) => i.ref)).toEqual(["p:praise_1", "p:harder"]);
    expect(phraseItems("Something written by AI")).toEqual([{ text: "Something written by AI" }]);
  });
});

describe("counting illustration", () => {
  it("draws exactly the quantities in the question", () => {
    const { container } = render(
      <CountingObjects2D visual={{ type: "objects", object: "apple", groups: [3, 2], op: "+" }} phase="question" />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName("3 and 2 objects");
    // each object is one <g> under the svg (plus sign is text)
    expect(container.querySelectorAll("svg > g").length).toBe(5);
  });

  it("describes subtraction", () => {
    render(<CountingObjects2D visual={{ type: "objects", object: "laddoo", groups: [7], op: "-", remove: 3 }} phase="question" />);
    expect(screen.getByRole("img")).toHaveAccessibleName("7 objects, 3 taken away");
  });
});

describe("LevelTally", () => {
  it("labels the level", () => {
    render(<LevelTally level="developing" />);
    expect(screen.getByText("Developing")).toBeInTheDocument();
    expect(screen.getByTitle("Developing level")).toBeInTheDocument();
  });
});
