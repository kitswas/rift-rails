# Coding standards

Read during review, not implementation. Implementation-time rules and pointers
live in `AGENTS.md` and `Design.md`.

- **Acceptance over state.** Tests assert observable outcomes ("one cue at a
  time"), not internal classes or counters. A test that encodes the bug is
  worse than no test.
- **Design is a gate.** Compare UI diffs to `Design.md`. Visual proof means a
  rendered screenshot at ≥601px and ≤600px plus the reduced-motion state.
- **Bounded I/O.** Every fetch has a timeout and an injectable adapter, so
  offline tests never touch the network. See `AGENTS.md:16` for the resource
  rule.
- **One home for a value.** Labels, IDs and colors come from `GAME_DATA` and
  shared tokens. A second literal is drift, even when it matches today.
- **Docs describe the present.** Removed APIs, paths and install flows do not
  appear in docs except as explicit migration notes. `pnpm check:docs`
  enforces the mechanical part.
- **Proof after the last edit.** All five checks pass after the last edit:
  `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm check:docs`,
  `pnpm test`. A targeted formatter on selected files does not count.
