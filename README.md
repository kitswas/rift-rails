# Rift Rails

[![License: AGPL v3](https://img.shields.io/badge/Code_License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/Assets_License-CC_BY--NC--SA_4.0-blue.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**Rift Rails** is an infinite rogue-like adventure and survival game.

![Rift Rails Cover](assets/logo-cover.png)

## Documentation

- [Design.md](Design.md) - core UI design rules.
- [Artwork-rules.md](Artwork-rules.md) - SVG and diorama art rules.
- [Audio-rules.md](Audio-rules.md) - sound rules.
- [Storyline plugins](docs/STORYLINE-PLUGINS.md) - author branching `actor verb target` stories as opt-in plugins.
- [Plugin registry](docs/PLUGIN-REGISTRY.md) - registry schema, verification, and opt-in behavior.
- [Coding standards](CODING_STANDARDS.md) - review-time rules for judgement calls.
- [Sonic Pi runtime](docs/SONIC-PI-RUNTIME.md) - the vendored offline runtime and how to update it.

---

## Development

```sh
pnpm install
pnpm dev          # no network needed; Sonic Pi runtime is vendored
pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:docs
pnpm test && pnpm test:e2e
pnpm build        # output in dist/
```

`pnpm audio:sonic-pi` refreshes the vendored runtime manually; see
[Sonic Pi runtime](docs/SONIC-PI-RUNTIME.md). CI verifies its hashes with
`pnpm check:sonic-pi`.

---

## License

This project is licensed under a dual-licensing scheme (see [LICENSE](LICENSE) for full legal text):

1. **Software & Algorithms:** All source code (`index.html`, `artwork-browser.html`, procedural generators, shaders, logic) is licensed under the [GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](https://www.gnu.org/licenses/agpl-3.0).
2. **Artwork, Graphics & Lore:** All assets (`assets/`), game lore, narrative, and aesthetic guidelines (`Artwork-rules.md`) are licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/).

Third-party components in `public/sonic-pi/` are **not** covered by this dual
scheme. They keep their own AGPL-3.0-or-later, GPL-3.0 and MIT licenses; see
[Third-Party Notices](public/THIRD-PARTY-NOTICES.md).

## Contributing

**Rift Rails is a personal project, not a community-driven initiative.**

It is built purely for the joy of creating, on my own terms, in my own time, and given away freely under open-source and Creative Commons licenses. In short, I do what I want with this.

### Want to take it in another direction?

**That is what the AGPLv3 license is for.** You have full access to the source code and complete legal freedom to fork the repository, modify the algorithms, and build your own vision.
