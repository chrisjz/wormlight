# Wormlight — working notes for AI assistants

A living _C. elegans_ in the browser: the Cook et al. 2019 connectome, simulated on the GPU, drives a physically simulated worm. Read `WORMLIGHT_SPEC.md` (the contract) and `PLAN.md` (the design) before changing the simulation.

## Commands

- `npm run dev` — Vite dev server. `npm run build` — typecheck + bundle.
- `npm test` — unit tests (Vitest).
- `npm run lint` / `npm run format:check` — both are CI gates; a pre-commit hook formats staged files.
- `npm run data:build` — rebuilds `public/data/wormlight.v1.json`, its `NOTICE.md`, `DATA_SOURCES.md` and `data/reports/` from the pins in `data/sources.json`. `npm run data:check` is the CI gate that fails when a committed output is stale.
- `npm run docs:fidelity` — regenerates `FIDELITY.md` from the registry and the runtime data; `npm run docs:check` is its CI gate.

## Hard conventions

- **Behaviour must emerge from the connectome.** Only the layers in spec §1.1 may sit outside the network, and nothing outside it may read behavioural state ("reversing", "near food"). Adding a layer is a major deviation: ask the maintainer first.
- **The CPU reference is the scientific ground truth.** WGSL kernels mirror it and behavioural trials run on it. A model change lands in both, with a parity test.
- **Every component, parameter and data element carries a fidelity level and a source** in the registry (spec §1.3): `src/science/citations.ts`, `params.ts` and `fidelity.ts`. `FIDELITY.md` is generated from the registry and `DATA_SOURCES.md` from `data/sources.json`; never edit either by hand. A value we set ourselves is level 1 or 0 and counts toward the free-parameter budget in `PLAN.md` §6.2, which a test enforces. Every citation the code, the runtime data or a generated page uses goes in `citations.ts` once, checked against Crossref or the publisher, and is referred to by id; prose in PLAN and DECISIONS may cite others. Editing `citations.ts` changes the runtime file's `meta.citations`, so rerun `npm run data:build` as well as `npm run docs:fidelity`.
- **Neural Interactome's matrices are indexed [post, pre].** Read `Gs.npy` the wrong way round and every port-check neuron fails. The port check drives Neural Interactome's own code for that reason.
- **Validation thresholds are fixed in advance** in `PLAN.md`. Changing one after seeing results is logged in `DECISIONS.md`, and the checkpoint is marked as changed.
- **Never invent citations.** Check every number against its source, and say so when unsure.
- Generated data comes from scripts that read pinned, hashed sources; never hand-edit it, rerun the generator. The scripts in `scripts/` run on Node's built-in TypeScript support, so their relative imports carry the `.ts` extension.
- Docs use British spelling, as the spec does.

## Process

- One focused PR at a time, always based on `main`, with no stacked PRs. The maintainer merges each before the next starts.
- Commit messages: an evocative first line, then a short story of the why. Write multi-line messages with `git commit -F <file>`.
- `gh pr edit` has been broken by a GraphQL deprecation; use `gh api -X PATCH repos/chrisjz/wormlight/pulls/<n>` instead.
- Prettier reflows Markdown. A nested ordered list that starts at 0 needs a blank line before it, or it merges into the paragraph above. A line straight after a list item is folded into that item, so leave a blank line before a following paragraph. After any scripted edit, grep-verify the result.
