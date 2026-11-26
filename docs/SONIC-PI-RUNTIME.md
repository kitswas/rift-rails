# Sonic Pi Runtime

The game boots its audio runtime from `/sonic-pi/` in `src/game/sonicPi.ts`.
Those files are vendored in `public/sonic-pi/` so `pnpm build`, CI and the e2e
web server need no network. A missing or changed file is a build/CI failure;
the game itself degrades to silence if the runtime cannot boot.

## What is vendored

Seventeen files: six runtime JS modules, six engine shims plus `version.json`,
the Emscripten runtime (`.wasm` / `.mjs`), `samples.json`, one generated buffer
and the `winwood_lead` synthdef. `public/sonic-pi/SHA256SUMS` holds their hashes.

The snapshot was taken from <https://sonic-pi.net/> (Sonic Pi 5.1 web beta) on
2026-11-26. The six JS files and the synthdef are byte-identical to upstream
commit `e8a030df0a747fc99ceb08a8f3bef05ca0e5c6db`; the rest are generated build
outputs. Licensing and Corresponding Source are in
[Third-Party Notices](../public/THIRD-PARTY-NOTICES.md).

This is a build-time offline guarantee only. At runtime the browser still
fetches the SuperSonic engine, samples and most synthdefs from jsDelivr (see
`engine/version.json`). Game audio is not fully offline.

## Verify

```sh
pnpm check:sonic-pi
```

`scripts/fetch-sonic-pi.mjs --dry-run` checks that all 17 files exist and match
`SHA256SUMS`. CI runs it on every pull request and reusable-workflow call.

## Update

1. Run `pnpm audio:sonic-pi`. It re-downloads all 17 files from sonic-pi.net with
   a 15-second timeout and reports `DRIFT` for any file whose hash changed.
2. Review the diff byte-for-byte (`git diff -- public/sonic-pi/`). Do not accept
   a partial or mixed snapshot.
3. Regenerate `public/sonic-pi/SHA256SUMS` for the changed files.
4. Update the provenance and pinned commit in
   [Third-Party Notices](../public/THIRD-PARTY-NOTICES.md) and this document.
5. Commit the runtime, hashes and docs together, then run the full check suite.

Run `pnpm check:sonic-pi` afterwards; it must pass offline.
