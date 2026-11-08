# Rift Rails

[![License: AGPL v3](https://img.shields.io/badge/Code_License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/Assets_License-CC_BY--NC--SA_4.0-blue.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**Rift Rails** is an infinite rogue-like adventure and survival game.

![Rift Rails Cover](public/assets/logo-cover.png)

---

## License

This project is licensed under a dual-licensing scheme (see [LICENSE](LICENSE) for full legal text):

1. **Software & Algorithms:** All source code (`index.html`, `src/`, `public/artwork-browser.html`, procedural generators, shaders, logic) is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0).
2. **Artwork, Graphics & Lore:** All assets (`public/assets/`), game lore, narrative, and aesthetic guidelines (`Artwork-rules.md`) are licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/).

## Development

TypeScript + Vite source lives in `src/`; `dist/index.html` is built as a single file.

```sh
pnpm install
pnpm dev        # http://127.0.0.1:8000
pnpm build      # dist/index.html
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm verify     # builds, serves dist on 8100, runs headless Edge harness
git config core.hooksPath .githooks
```

`src/game/*.ts` modules were extracted verbatim from the old single-file script. Legacy modules still carry `// @ts-nocheck`; remove that marker per module as real types land. Keep gameplay, save format, RNG, and procedural art behavior unchanged during typing work.

## Contributing

**Rift Rails is a personal project, not a community-driven initiative.**

It is built purely for the joy of creating, on my own terms, in my own time, and given away freely under open-source and Creative Commons licenses. In short, I do what I want with this.

### Want to take it in another direction?

**That is what the AGPLv3 license is for.** You have full access to the source code and complete legal freedom to fork the repository, modify the algorithms, and build your own vision.
