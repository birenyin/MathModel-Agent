# Modeling Code

Use this skill when a modeling workflow needs reproducible code.

Output:

- data loading assumptions
- preprocessing plan
- baseline model
- improved model
- evaluation metrics
- figure/table export plan
- file structure

Rules:

- Prefer Python as the default implementation language.
- Keep data paths configurable.
- Save generated figures under `figures/`.
- Save result tables under `tables/`.
- Include random seeds when stochastic methods are used.
- Write code that can be run from the workspace root.

