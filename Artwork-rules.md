# Core Diorama Rules

1. **2D Silhouettes First, 3D Only When Needed**
Use clean 2D cutout shapes by default. Use 3D faceted shading only when 2D is not enough to show form. Simplicity and mystery are preferred over complex detail.

2. **Strict Back-to-Front Drawing (Painter’s Algorithm)**
Always draw layers from back to front: sky first, then distant background, midground, and finally foreground silhouettes.

3. **Distance Fog on Far Layers**
Add a soft blur (`filter: blur(...)`) and lower opacity to distant shapes so they fade into the horizon.

4. **Paper-Cutout Drop Shadows**
Add drop-shadows (`filter: drop-shadow(...)`) to midground and foreground layers so they look like stacked paper art.

5. **Layer Shapes & Shared Edges**
Draw terrain as overlapping layer cutouts. When splitting a single shape into light and shadow facets, share exact corner points to avoid cracks.

6. **Random Placement Over Rigid Grids**
Scatter repeated elements (tents, trees, ruins) with seed-based variety and natural spacing instead of placing them on a rigid grid. Keep all elements within screen bounds.

7. **The 5-Tone Color Rule (`p[0]` to `p[4]`)**
Color every scene with 5 strict tones:
    - **`p[0]` (Deep Dark):** Foreground silhouettes and deep shadows.
    - **`p[1]` (Shadow):** Shaded sides of terrain and buildings.
    - **`p[2]` (Midtone):** Distant hills and neutral base ground.
    - **`p[3]` (Light):** Sunlit surfaces and upper sky.
    - **`p[4]` (Glow):** Sun, moon, stars, crystals, and light points.

8. **Faceted 3D Shading (When Used)**
When 3D is needed, split the shape down the center:
    - **Lit side:** Bright tones (`p[3]` or `p[4]`).
    - **Shadow side:** Dark tones (`p[1]` or `p[0]`).

9. **Water as a Full-Width Layer**
Draw water as a simple filled rectangle across the scene so terrain naturally sits on it.

10. **Real Depth Rendering**
Make foreground objects sharp and detailed. Make distant objects soft, faded, and simplified.
