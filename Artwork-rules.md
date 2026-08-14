# Core Diorama Rules *(Original Guidelines)*

1. **No Gaps in Shapes (Exact Vertex Math)**
Connect all low-poly shapes (mountains, cliffs, stairs) using exact, shared corner points and edges so there are never accidental cracks or gaps between polygons.
2. **Strict Back-to-Front Drawing (Painter’s Algorithm)**
Always draw layers in order from furthest to closest: start with the sky in the very back, build up the midground, and finish with the foreground at the very front.
3. **Distance Fog on Far Layers**
Give distant background mountains and ridges a soft blur (`filter: blur(...)`) and lower opacity so they fade naturally into the horizon.
4. **Paper-Cutout Drop Shadows**
Add drop-shadows (`filter: drop-shadow(...)`) to midground structures and foreground shapes so each layer pops like stacked paper art.
5. **Geometric Flow & Curves**
Use overlapping shapes that share edges and corners, repeat elements with even spacing, and use smooth mathematical curves (parabolas and arches) for dunes, fields, and vaults.
6. **The 5-Tone Color Rule (`p[0]` to `p[4]`)**
    Color every scene using a strict 5-tier palette hierarchy:
    - **`p[0]` (Deepest Dark):** Foreground silhouettes and deep crevice shadows.
    - **`p[1]` (Shadow):** Shaded sides of terrain and architecture.
    - **`p[2]` (Midtone):** Distant mountains and neutral base surfaces.
    - **`p[3]` (Light):** Sunlit faces, illuminated ground, and upper sky.
    - **`p[4]` (Glow / Highlight):** Celestial bodies, sun coronas, crystals, and bright light points.
7. **Faceted 3D Shading (Lit vs. Shadow Split)**
    To give flat 2D shapes a low-poly 3D look, split every mountain, tree, or tower down a central spine line:
    - Fill the **lit side** (usually left/top) with bright tones (`p[3]` or `p[4]`).
    - Fill the **shadow side** (usually right/bottom) with dark tones (`p[1]` or `p[0]`).
8. **2D Shapes are good as well**
Especially when it uses the viewer's imagination or provides a sense of mystic. Simplicity has its own charm.
9. Water/Fluid should be a layer with a filled rectangle, not specific shapes. It will naturally fill gaps.
10 **Real depth rendering**
Closest objects are detailed, farther objects are simplified. Distance is based on real world perspective and physics, not layer depth.
