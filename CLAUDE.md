## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## HARD CONSTRAINTS — Cabinet Maker Tool

### This is NOT a kitchen tool. It is a cabinet maker's tool.

**We are cabinet makers.** Cabinets go in kitchens, bathrooms, laundry rooms, offices, garages, entertainment centers, mudrooms, closets, and anywhere else. ALL code, UI text, prompts, variable names, comments, and documentation MUST be room-agnostic. Never say "kitchen" — say "space", "room", or "layout".

### Every fix must be GENERAL, not image-specific.

- **NEVER optimize for a single test image.** Every change to the AI prompts, solver, renderer, or scene generation must work correctly for ALL cabinet layouts — not just the current test photo.
- When fixing a bug found with one image, ask: "Would this fix also work for a bathroom vanity? A garage workshop? An office built-in?" If no, the fix is wrong.
- **Track iterations in `iterations.md`** — record what changed, what improved, what broke. Include lessons learned that apply to ALL future images, not just the current one.
- The solver, renderer, and AI prompts must handle: single-wall runs, L-shaped layouts, tall cabinets (pantry, oven), short cabinets (above fridge), open shelving, varying counter heights, no countertop at all, and mixed appliance types.

---

## HARD CONSTRAINTS — AI Evaluation Panel

### Mandatory: Run AI Evaluation Panel After Every Code Change

After EVERY run of the estimator (photo → analyze → solve → report), you MUST:

0. **VISUAL COMPARISON FIRST**: Before scoring anything, you MUST visually compare the SVG drawing to the original photo. The drawing must LOOK like the kitchen. If it doesn't look right, the score cannot be above 7.0 regardless of how good the numbers are. Numbers don't matter if the picture doesn't match.

1. **Simulate 4 AI agent evaluators** with these personas:
   - **Cabinet Maker**: Would I trust these measurements to cut wood?
   - **Cabinet Designer / Estimator**: Does the drawing match the photo? Proportions correct?
   - **Project Manager**: Is the workflow usable? Would my crew trust this?
   - **Software Developer**: Is the code robust? Edge cases handled?

2. **Each agent scores 1-10** and writes a specific critique (what's wrong, what's good).

3. **Record every run in `scores.md`** with:
   - Run number, date, photo used
   - Fixes applied since last run
   - Results (cabinet widths, confidence)
   - Each agent's score and comment
   - Average score
   - Issues logged for next iteration

4. **DO NOT STOP ITERATING until the average score is >= 9.5/10.**
   - If score < 9.5: identify the lowest-scoring agent's complaints, fix them, re-run, re-evaluate.
   - Every fix must be verified end-to-end before re-scoring.
   - No skipping evaluation runs. No rounding up scores.

5. **The scoring log in `scores.md` is the source of truth.** Every run is permanently recorded. Scores must be honest and reflect the actual output quality, not aspirational quality.

### Score Thresholds
- **< 7.0**: Critical issues. Stop and re-plan before more code changes.
- **7.0 - 8.4**: Significant issues. Fix the top 3 complaints and re-run.
- **8.5 - 9.4**: Close. Fix remaining polish issues and re-run.
- **>= 9.5**: PASS. Ready to ship.

### Software Developer Agent Persona
The AI Software Developer evaluator is a **highly experienced staff engineer**. They:
- Make BOLD, decisive changes to reach quality goals — no timid half-measures
- Refactor aggressively when the architecture is wrong, not just patch symptoms
- Treat each evaluation as a code review from someone who has shipped at scale
- Will not accept "good enough" — they push for excellence in every dimension
