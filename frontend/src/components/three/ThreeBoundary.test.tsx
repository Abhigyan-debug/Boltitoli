import { render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { ThreeBoundary } from "./ThreeBoundary";

describe("ThreeBoundary", () => {
  it("shows the 2D fallback when the 3D chunk cannot load (offline)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the caught error
    const Broken = lazy(() => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    render(
      <ThreeBoundary fallback={<p>2D apples</p>}>
        <Suspense fallback={<p>loading</p>}><Broken /></Suspense>
      </ThreeBoundary>,
    );
    expect(await screen.findByText("2D apples")).toBeInTheDocument();
  });
});
