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

### Extraction Priority — CABINETS ONLY

The extraction system exists to identify **cabinets**. Nothing else matters.

**Priority order:**
1. **Recognize every cabinet** — count every separate box, don't merge adjacent units
2. **Get the size right** — width, height, depth using standard sizes only
3. **Get the position right** — left-to-right order, which row (upper/lower/tall)

### HARD CONSTRAINT — Cabinet Count Must Be 100%

**The number of cabinets detected can NEVER be off.** Widths can be adjusted later in the editor. Positions can be corrected. But a MISSING cabinet means the cabinet maker doesn't know it exists — that's a showstopper.

- It is BETTER to over-detect (find a cabinet that isn't there) than to under-detect (miss one that is)
- Every vertical seam = a separate cabinet. Period.
- Two single-door units side by side = TWO cabinets, not one double-door
- A narrow 9" pullout is still a cabinet — don't skip it because it's small
- Short stackers above the fridge are cabinets — don't skip them because they're short
- If in doubt, split it into two cabinets rather than merge into one

**Extraction prompts must emphasize counting FIRST, sizing SECOND.** The AI must enumerate every box before it starts estimating widths. Fixes to extraction accuracy must be GENERAL — they must work for any room with any number of cabinets, not just the current test image.

**Appliances, fridges, ranges, dishwashers are NOT cabinets.** They are just GAPS — empty spaces between cabinets that affect positioning. Don't spend extraction effort identifying what appliance goes in a gap. A gap is a gap. Label it "opening" with a width and move on.

**Do NOT optimize for:**
- Appliance identification (range vs dishwasher vs fridge — irrelevant to cabinet maker)
- Countertop material or style
- Hardware or finish details
- Room type identification

**A cabinet maker looks at the extraction and asks:**
- "Are all my boxes accounted for?"
- "Are the widths right?"
- "Is the layout order correct?"

If the answer to those three questions is yes, the extraction is good. Everything else is noise.

## HARD CONSTRAINT — No Rewrites, Only Surgical Extractions

**NEVER rewrite a file from scratch when refactoring.** When splitting a monolith into smaller files:

1. **Copy-paste the exact code** into the new file, then adjust imports/exports. Do NOT rewrite from memory.
2. **Verify prop contracts:** After ANY refactor that moves component calls to a new file, grep for the component's `export default function` signature and confirm every prop is passed correctly at every call site. Prop name mismatches (e.g. `cab` vs `cabinet`) are silent failures.
3. **One concern per commit:** Never bundle backend + frontend + data model + architecture in a single commit. Split into: schema/DB first → API second → frontend decomposition third → wiring verification fourth.
4. **Test interactions, not just rendering:** A component that renders correctly but has broken callbacks (edit, delete, move, context menu) is a broken component. Verify the EDIT workflow, not just the visual output.
5. **No phantom props:** Never pass props a component doesn't accept. Never omit props a component requires. If unsure, read the function signature before writing the JSX.

**Why:** On 2026-03-28, a "frontend upgrade" rewrote RoomEditor.jsx from memory instead of extracting from App.jsx. Result: 15 missing/wrong props across 3 components, entire edit workflow broken, gap editing deleted, context menu deleted. The render looked fine — the damage was invisible until someone tried to edit a cabinet.

## HARD CONSTRAINT — Chrome MCP Verification Before Every Commit

**NEVER commit code without verifying it works in Chrome MCP first.** Every change that touches UI or API must be tested with a real screenshot or API call before `git commit`. No exceptions.

- If you changed frontend code: take a Chrome MCP screenshot proving the change works
- If you changed backend code: curl the endpoint or trigger it from the UI and verify
- If you changed both: verify the full flow end-to-end in Chrome MCP
- A build passing (`vite build`) is NOT sufficient — you must verify runtime behavior
- If Chrome MCP is unavailable, explicitly tell the user you could not verify

**Why:** Bugs that ship because "it compiled" waste the user's time and erode trust. The photo_bytes bug was introduced because the extraction function signature was changed in server.py without verifying the actual extraction flow worked.

## HARD CONSTRAINT — Project Manager Evaluation Standard

### Be brutally critical. No self-congratulation.

---

## TEMPORARY HARD CONSTRAINT — 150 Bold Iterations

### DO NOT STOP until you have completed 150 bold iterations on the editor.

**Goal:** Make this tool 5X better than manually doing a cabinet spec. Cabinet designers must TRUST it and WANT to use it. If it's not dramatically faster than pencil-and-paper, it fails.

**Rules:**
- Each iteration must be BOLD — meaningful UX or functional improvement, not cosmetic tweaks
- **ONE iteration at a time. No batching. No delegating batches to subagents.**
- Each iteration: make the change, verify it in Chrome MCP with a real screenshot, confirm it works, THEN move to next
- Do not lie about iteration count — each must be real and verified
- Track iteration count honestly
- After 150 iterations, REMOVE this section

**Remove this section ONLY after completing 150 bold iterations.**

