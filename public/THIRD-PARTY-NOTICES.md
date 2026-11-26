# Third-Party Notices

`public/sonic-pi/` contains the Sonic Pi web runtime. It is not our work: it is
vendored byte-for-byte so builds and CI need no network access. These files are
**not** covered by Rift Rails' dual license; they keep their upstream licenses.
See [Sonic Pi runtime](../docs/SONIC-PI-RUNTIME.md) for update instructions.

## Provenance

- Source: <https://sonic-pi.net/> (Sonic Pi 5.1 web beta), verified 2026-11-26.
- Upstream: <https://github.com/sonic-pi-net/sonic-pi>, `dev` branch.
- The six runtime JS files and `synthdefs/sonic-pi-winwood_lead.scsyndef` are
  byte-identical to upstream commit
  `e8a030df0a747fc99ceb08a8f3bef05ca0e5c6db`. Their SPDX headers are preserved.
- `engine/*`, `runtime/sp_runtime.wasm`, `runtime/sp_runtime.mjs`, `samples.json`
  and `buffers/rand-stream.wav` are generated build outputs served by the web
  beta. They are not tracked in the upstream git tree.
- Per-file SHA-256 hashes: [`sonic-pi/SHA256SUMS`](sonic-pi/SHA256SUMS).
- The game still loads the SuperSonic engine, samples and remaining synthdefs
  from jsDelivr at runtime; this vendoring only makes the build offline.

## Licenses

| Vendored files | License | Notes |
| --- | --- | --- |
| `sonic_pi.js`, `runtime.js`, `live-core.js`, `live-worker.js`, `osc.js`, `gui-stream.js` | AGPL-3.0-or-later | Copyright © 2026 Sam Aaron and contributors. SPDX headers kept verbatim. |
| `engine/*.js`, `engine/version.json` | AGPL-3.0-or-later | Build shims re-exporting `supersonic-scsynth@0.99.0` from jsDelivr. |
| `runtime/sp_runtime.wasm`, `runtime/sp_runtime.mjs` | AGPL-3.0-or-later (object code) | Embeds mruby (MIT) and generated data. |
| `samples.json`, `buffers/rand-stream.wav` | MIT (generated data) | Copyright © 2012–2026 Samuel Aaron and contributors. |
| `synthdefs/sonic-pi-winwood_lead.scsyndef` | GPL-3.0 (design), compiled object | See [GPL-3.0](#gpl-30). |

### AGPL-3.0-or-later

The full AGPL text is in [`LICENSE`](../LICENSE) and is copied into `dist/` on
release. We make no modifications to the upstream files and keep every
copyright and license header intact.

### MIT

Upstream `app/` code outside `app/web/`, the mruby runtime embedded in
`sp_runtime.wasm` / `sp_runtime.mjs`, and generated data are MIT licensed:

> Copyright (c) 2012–2026 Samuel Aaron and contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The mruby copyright notice: Copyright (c) 2015–2026 Yukihiro Matsumoto and the
mruby developers.

### GPL-3.0

`sonic-pi-winwood_lead` is one of five GPL-3.0 synth designs (along with
`bass_foundation`, `bass_highend`, `organ_tonewheel` and `autotuner`). Its
compiled synthdef is vendored and its design is also embedded in the runtime's
string table. The full GPL-3.0 text ships as [`LICENSES/GPL-3.0.txt`](LICENSES/GPL-3.0.txt).

### EPL-2.0 and CC0-1.0

Overtone synth designs (EPL-2.0) and samples/wavetables (CC0-1.0) are referenced
by the runtime but fetched from the CDN, not vendored. CC0 requires no
attribution.

### SuperSonic and Clockwork

The sound engine is loaded from jsDelivr at runtime, not distributed in
`dist/`. Both are AGPL-3.0-or-later:

- <https://github.com/samaaron/supersonic>
- <https://github.com/samaaron/clockwork>

## Corresponding Source

For the AGPL object code (`sp_runtime.wasm`, `sp_runtime.mjs`) and the GPL-3.0
synthdef, the Corresponding Source is the pinned upstream tree plus its build
instructions (AGPL §6(d)):

- <https://github.com/sonic-pi-net/sonic-pi/tree/e8a030df0a747fc99ceb08a8f3bef05ca0e5c6db>
- <https://github.com/sonic-pi-net/sonic-pi/blob/e8a030df0a747fc99ceb08a8f3bef05ca0e5c6db/BUILD-WEB.md>
- <https://github.com/sonic-pi-net/sonic-pi/blob/e8a030df0a747fc99ceb08a8f3bef05ca0e5c6db/etc/synthdefs/compiled/sonic-pi-winwood_lead.scsyndef>
