# Repo Rules

1. Never edit this file directly.
2. Every line of code is a liability.
3. Always run formatters and linters before committing.
4. Do not commit secrets or sensitive information.
5. If usage instructions change, update the README.md accordingly.
6. If edits in one file affect another, update both files to maintain consistency.
7. Deleting/minimizing is better than adding.
8. Single source of truth. Otherwise, bugs follow.
9. Git commits should be atomic and self-contained. Commit message description should be concise and explain why (what's not obvious from the diff). Skip descriptions for small changes.
10. Make no assumptions. Always ask for clarification if needed.
11. Do not implement workarounds or use hacks. Keep the implementation clean and maintainable. If something is not working, fix the root cause instead of patching it.
12. Prioritize simplicity and clarity in code and design.
13. All Python one-shot/automation scripts (not module files) must declare their dependencies (versioned) via [inline script metadata](https://packaging.python.org/en/latest/specifications/inline-script-metadata/#inline-script-metadata).
14. Resource lifecycle should be managed using the `with` statement (in Python), RAII in C++ or equivalent patterns in other languages.
15. Frontend devs must be able to develop and preview the frontend without the backend running.
16. Every external API call or operation that costs real money or resources must have a mock adapter or dry-run mode for testing.
17. Large model (main thread) orchestrates. Subagents are smaller models that carry out well-defined tasks. To avoid concurrent edits to a shared resource, we can have n read-only subagents in parallel or 1 write-capable subagent per resource (like a git worktree, database, directory-tree). Subagent types - investigator (findings with citations), builder (implements a plan), reviewer (cross-checks), and general-purpose. Subagents are not allowed to spawn other subagents. Use subagents to avoid filling up the context window with irrelevant information.
18. Follow the design guidelines in Design.md.
19. Do not dump documentation in the Readme.md. Use a separate documentation file for each topic and link to it from the README.md.
