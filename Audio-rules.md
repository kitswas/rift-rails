# Core Audio Rules

1. **One Engine for All Sound**
Every sound in the game comes from the same audio engine. Music and effects share one source of truth; no parallel synthesis systems.

2. **Original Composition Only**
Every track is written for Rift Rails. Ready-made examples and borrowed material are never used directly.

3. **Tracks Are Standalone**
Each soundscape is a complete, self-contained piece. It can move in and out of the Sonic Pi editor unchanged, with no translation or hidden dependencies.

4. **One Soundscape at a Time**
Only one ambient track plays at once. Switching replaces it cleanly, and silence is a first-class state rather than an absence of code.

5. **Every Layer Earns Its Place**
Add a layer only for a distinct purpose. If a layer makes the mix worse, remove it — correctness on paper never outweighs how it sounds.

6. **Distinct Character Per Track**
Soundscapes differ in texture, rhythm, and register. Two tracks should never feel like variations of the same idea.

7. **Level Is Part of the Composition**
Envelope length, amplitude, and filter range decide whether a voice is heard. A technically correct note at the wrong level is a silent bug.

8. **Validate With Checks On**
Sound is verified against the real engine with argument checks enabled. A clean trace without checks is not proof that it works.

9. **State Travels With Its Use**
A sound carries what it needs at the moment it plays. It never relies on state left behind by a previous run.

10. **Controls Are Global**
Mute, volume, and ducking behave the same way for music and for effects. The player should never have to manage them separately.

11. **The Game API Is a Contract**
Game code asks for named sounds, never for synth parameters. Changing the engine must not change its callers.

12. **Generated Assets Are Not Source**
Engine binaries and sample libraries are fetched, not committed. The repository holds only what we author.
