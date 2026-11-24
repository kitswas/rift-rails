# Core Design Rules

UI rules for Rift Rails. Art follows `Artwork-rules.md`; sound follows `Audio-rules.md`. These rules decide what to build before any code is written. When a rule and a preference conflict, the rule wins.

1. **The Codebase Is the Design Tool**
   No external design tool, no mockup service, no framework to import. Existing markup, styles, and components are the single source of truth. If it is not in the repo, it does not exist yet.

2. **Design in Text First**
   Before editing, present a brief: section hierarchy, behavior at each size, and every interactive state. Unclear brief means stop and ask. Prose is cheap to change; pixels are not.

3. **Reuse Before Inventing**
   Use the existing token, component, or pattern the way neighboring screens use it. A new color value, type size, shadow, or duplicate component is a defect unless nothing existing fits.

4. **One Home for Every Value**
   Each color, spacing step, radius, layer, and label is defined once and read everywhere. Add a shared definition rather than a second literal. Two sources of truth guarantee drift.

5. **Theme Is Data, Not Palette**
   Procedural realm colors arrive at runtime. Components stay neutral and consume them indirectly. Never bake one realm's colors into a control or screen.

6. **Blueprint, Not Dashboard**
   Identity comes from square structural surfaces, hard offset shadows, crisp edges, monospace type, and uppercase labels. Status color communicates meaning and nothing else. Decoration never competes with information.

7. **Hierarchy Over Density**
   One primary action per screen. Group by meaning, not by implementation order. If everything is emphasized, nothing is.

8. **Every Screen Has Two Sizes**
   Stack on small screens, use the available space on large ones. Reflow content; never hide it to make layout easier. New breakpoints need a reason.

9. **Every Control Has Every State**
   Default, hover, focus, active, loading, empty, error, and disabled. An undefined state is designed by the browser, and the browser is not the designer.

10. **Keyboard Is a First-Class Input**
    Semantic elements, visible focus, logical order, focus trapped inside dialogs and returned on close. Anything clickable is reachable and operable without a pointer.

11. **Assistive Tech Reads the Same UI**
    Hide decorative art, label meaningful controls, announce changes, expose current state. No information carried by color or position alone. Never remove an existing accessibility attribute or focus handler.

12. **Motion Respects the Player**
    Motion signals transition, never blocks play. Keep it brief and honor reduced-motion preferences. Silence and stillness are valid states, not bugs.

13. **Types Are Part of the Design**
    No `any`, no untyped placeholder data. Stubs are labeled, never silent. A screen that cannot be typed clearly is not understood yet.

14. **Constraints Beat Options**
    No new layer, wrapper, setting, or abstraction without a proven need. The smallest design that fully works wins. Fix root causes instead of adding workarounds.

15. **Proof Before Done**
    Compare the result to these rules, capture a rendered screenshot at ≥601px and ≤600px plus the reduced-motion state, then run `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm check:docs` and `pnpm test` after the last edit. DOM assertions alone are not visual proof; unverified design is unfinished design.
