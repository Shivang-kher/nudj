---
sidebar_position: 1
title: Lifecycle Framework
---

# Lifecycle Framework

> How every piece of the Nudj mobile app gets built. Seven steps, each producing a
> reviewable artifact, each gated on explicit approval before the next one starts.

---

## The seven steps

| # | Step | Model | Output | Cadence |
|---|---|---|---|---|
| 1 | Implementation plan | Opus | Milestones, scope fence, risks, compliance posture | Once, global |
| 2 | Tech spec | Opus | API contracts, SQL DDL, module signatures, pinned libraries | Once, global |
| 3 | Pseudocode | Opus | Control flow + data shapes for the milestone about to be built | Per milestone |
| 4 | Execution | Sonnet | Working code against the spec and pseudocode | Per milestone |
| 5 | Review & compliance check | Opus | Code review + SEBI/DPDP checklist walk | Per milestone |
| 6 | Testing | Opus designs, Sonnet writes | Unit, component, E2E, firewall red-team | Per milestone |
| 7 | Ship | — | EAS build, TestFlight + Play internal, beta | Once, at M7 |

## Why steps 1–3 are global but 4–6 are per milestone

Architecture, API contracts and the data model are stable — they are worth getting
right once, up front, and they change rarely. Writing pseudocode for week 12 in week 1
would be fiction, and auditing twelve weeks of code in week 11 means finding
compliance problems when they are most expensive to fix.

So:

- **Steps 1–2 run once.** One plan, one tech spec covering the whole of v1.0.
- **Step 3 grows.** The pseudocode document gains a section per milestone, written
  just ahead of the execution that consumes it.
- **Steps 4–6 cycle.** M0 → pseudocode → execute → review → test → approve → M1.
- **Step 7 fires once**, at the end of M7.

## Rules

1. **Nothing is built without approval.** Each step ends with a reviewable artifact and
   a stop. No code is written until Step 2 is approved, and no milestone starts until the
   previous one has passed its review and test gates.
2. **Every step produces two copies.** A published artifact page for review, and a
   Markdown copy committed under `wiki/docs/mobile/` so Docusaurus remains the source
   of truth.
3. **Compliance is a gate, not a phase.** Step 5 includes the SEBI and DPDP checklist
   for every milestone that touches portfolio data or the assistant — not a single audit
   at the end.
4. **The concepts doc grows with the code.** `wiki/docs/react-native-concepts.md` gains
   the React Native concepts each milestone introduces, explained against the Nudj code
   that uses them.
5. **The scope fence is a contract.** Anything outside the "In — v1.0" column of the
   implementation plan is a v1.1 conversation, not a mid-milestone addition.

## Artifact index

| Step | Document | Status |
|---|---|---|
| 1 | [Implementation Plan](./implementation-plan.md) | In review |
| 1 | [Design Sketchboard](./design-sketchboard.md) | In review |
| 1 | [Dev Setup & Live Reload](./dev-setup.md) | In review |
| 2 | [Tech Spec](./tech-spec.md) | Approved |
| 3 | [Pseudocode — M0](./pseudocode-m0.md) | ✅ Built & verified |
| 5 | Review & Compliance Log | Not started |
| 6 | Test Plan | Not started |
| — | [React Native Concepts](../react-native-concepts.md) | Living |
