import { Component, type ReactNode } from "react";

/**
 * Shows `fallback` when a 3D scene fails: its lazy chunk cannot load (offline — three.js is not
 * precached) or WebGL throws. 3D is decoration; a lesson must never stop because of it.
 */
export class ThreeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
