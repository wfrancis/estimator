# Cabinet Estimator — AI Evaluation Scores

## Scoring Panel

Each run is evaluated by 4 AI agent personas:

| Agent | Role | Focus |
|-------|------|-------|
| **Cabinet Maker** | Builds cabinets from these measurements | Are widths realistic? Do standard sizes match? Would I trust this to cut wood? |
| **Cabinet Designer / Estimator** | Designs layouts, quotes jobs | Does the drawing match the photo? Are proportions right? Missing anything? |
| **Project Manager** | Oversees the job site workflow | Is the app usable? Is the workflow fast? Would my crew actually use this? |
| **Software Developer** | Maintains the codebase | Is the code robust? Error handling? Edge cases? |

**Score: 1-10 scale. Target: 9.5 to pass.**

---

## Run 1 — 2026-03-18 (Baseline before improvements)

**Photo:** Real kitchen — white shaker cabinets, marble counter, fridge on right

**Results:** 15" + 24"(DW) + 33" + 15" + 33"(FRIDGE) — 71% confidence

### Cabinet Maker — Score: 4/10
> "The base widths don't look right. That sink base should be 30" not 33" — I've never seen a 33" sink base with that door/drawer config. The fridge opening at 33" is too narrow for a standard 36" fridge. Wall cabinets are completely wrong — they're all the same size and spread evenly, which doesn't match the photo at all. I wouldn't cut anything from this."

### Cabinet Designer / Estimator — Score: 3/10
> "The elevation drawing looks nothing like the photo. Wall cabinets are uniform boxes with no range hood gap. In the photo there are clearly different sized wall cabinets — two tall ones on the left, smaller ones in the center above the sink, and a short one above the fridge. The drawing doesn't show any of this. Proportions are way off."

### Project Manager — Score: 6/10
> "The workflow itself is decent — upload, analyze, measure, solve, confirm. That part is intuitive. But if my crew sees a drawing that doesn't match reality, they'll lose trust immediately. The 71% confidence is too low — nobody's going to order cabinets at 71%."

### Software Developer — Score: 5/10
> "The backend works end-to-end but the GPT prompt doesn't ask for wall cabinet gaps or individual heights. Wall cabinets aren't solved through the constraint solver. The SVG drawing spreads wall cabinets evenly with no alignment to base cabinets below. IPv6/IPv4 proxy bug caused connection failures."

### **Run 1 Average: 4.5/10** ❌

**Issues logged:**
1. Wall cabinets not aligned to base cabinets
2. No range hood gap in drawing
3. All wall cabinets same height (should vary)
4. Fridge opening too narrow (33" vs 36")
5. Sink base width questionable (33" vs 30")
6. Wall cabinets not solved through constraint solver
7. 71% confidence too low for production

---

## Run 2 — 2026-03-18 (After backend accuracy fixes)

**Photo:** Same real kitchen photo

**Fixes applied:**
- Updated GPT prompt: detects wall_gap, above_base_ids, variable wall cabinet heights
- Added wall cabinet solver (solve_wall_cabinets method)
- SVG wall cabinets now aligned to base cabinets via above_base_ids
- Wall gaps rendered (range hood area visible)
- Variable wall cabinet heights in drawing

**Results:** 15" + 24"(DW) + 30" + 15" + 36"(FRIDGE) — 85% confidence

### Cabinet Maker — Score: 6.5/10
> "Better. The 30" sink base makes more sense now. The 36" fridge opening is correct — that's standard. 15" cabinets on left and right of sink are plausible for a narrow kitchen. But 85% confidence still makes me nervous. I'd want to verify the sink base width before ordering. The wall cabinet widths aren't labeled individually — I can't tell what standard sizes they are. The drawing shows '54"' and '36"' spans but not individual cabinet widths."

### Cabinet Designer / Estimator — Score: 6/10
> "Much better drawing. I can see the range hood gap now and wall cabinets are grouped correctly above their base cabinets. The right group (above fridge) is shorter, which matches reality. But the wall cabinet dimensions only show span widths (54", 36") not individual cabinet widths. I need to know each wall cabinet is 15" or 18" or 27" etc. Also the drawing title overlaps with dimension labels at the top. The wall cabinets are still shown as orange/estimated — they should be blue/solved since the solver ran."

### Project Manager — Score: 7/10
> "85% confidence is better but still below my comfort zone of 90%+. The disambiguation prompt is good — asking to measure base_3 to choose between 30" and 33" is exactly the right UX. The full flow works smoothly now. But the drawing still has visual issues — overlapping labels, wall cabinets shown as estimated when they should be solved."

### Software Developer — Score: 7/10
> "Good progress. The wall solver, above_base_ids alignment, and wall_gap detection all work. The /scene endpoint returns correct 3D-ready data. But: (1) Three.js integration crashes due to React 18 incompatibility — needs version pinning or removal. (2) Wall cabinet door_count was set from raw_pixel_width (float) causing a crash — fixed but hacky. (3) The SVG dimension labels overlap at the top. (4) Wall cabinets show source='estimated' even after solving because the SVG drawing uses the base solver's width_lookup which doesn't include wall sections."

### **Run 2 Average: 6.6/10** ❌

**Issues logged:**
1. Wall cabinet individual widths not labeled (only span shown)
2. Wall cabinets show as "estimated" (orange) even after solving
3. Dimension labels overlap with title at top of SVG
4. 85% confidence — need higher
5. Three.js integration crashes (React version incompatibility)
6. Need isometric 2.5D view for better visualization
7. Wall cabinet solved widths not fed back into SVG source_lookup

---

## Run 3 — 2026-03-18 (Wall cabinet fixes + label fixes)

**Photo:** Same real kitchen photo

**Fixes applied:**
- Wall cabinet solved widths now use solver result (blue/solved color)
- Wall cabinet x-position from above_base_ids, width from solver (not span override)
- MARGIN_TOP increased 50→80 to reduce title/label overlap
- Individual wall cabinet widths labeled (15", 24", 42", 36")
- Staff engineer CLAUDE.md constraint added

**Results:** 15" + 24"(DW) + 30" + 15" + 36"(FRIDGE) — 79% confidence
**Wall cabinets:** Mostly blue/solved, center group still orange/estimated (bridge cabinets GPT wasn't sure about)

### Cabinet Maker — Score: 7.5/10
> "The base layout is solid now — 15" + 24"(DW) + 30"(sink) + 15" + 36"(fridge) = 120" + 2" fillers = 122". That checks out. I'd feel OK ordering base cabinets from this. The wall cabinets show individual widths now — 15", 24" on the left are standard sizes. The 42" label in the center is a span, not a single cabinet. I still need to know: is that one 42" wall cabinet or two 21" ones? The center bridge cabinets (orange) are still uncertain. I need ALL cabinets solved to blue before I order."

### Cabinet Designer / Estimator — Score: 7/10
> "The drawing layout is much closer to the photo now. I can see the gap between wall cabinet groups. The upper-right group above the fridge is shorter — correct. Base proportions look right. But: (1) the center wall cabinets overlap visually — the 42" and 54" spans are stacked on top of each other which is confusing. (2) The title 'Cabinet Elevation — Solved' still overlaps with the 24" dimension label. (3) The drawing doesn't show which wall cabinets are doors vs gaps — the range hood gap area has orange dashed boxes that look like cabinets when they should be empty space with a hood shape."

### Project Manager — Score: 7.5/10
> "79% confidence is below my 90% target. The base cabinets are right but the wall uncertainty drags the score down. The workflow is smooth — analyze → measure → solve → confirm works well. The disambiguation prompt ('measure base_3 to confirm 30 vs 33') is exactly right UX. But I need to see 90%+ confidence before signing off on a production order."

### Software Developer — Score: 7.5/10
> "Architecture improvements are solid — wall solver, above_base_ids alignment, wall_gap detection all work. The /scene endpoint is clean. But: (1) GPT returns inconsistent wall section data — sometimes above_base_ids references IDs that don't exist in base sections, causing KeyError risks. (2) The wall_gap sections overlap with wall cabinet sections in the drawing. (3) Three.js code is dead code — Kitchen3D.tsx and ThreeTest.tsx should be removed. (4) The test_kitchen.jpg serving endpoint should be dev-only. (5) No error boundary if the SVG rendering fails."

### **Run 3 Average: 7.4/10** ❌

**Issues logged:**
1. Center wall cabinets confusing — 42" and 54" spans overlap visually
2. Title still overlaps with dimension labels
3. Wall_gap sections rendered as orange boxes — should show as empty/hood
4. 79% confidence too low — need 90%+
5. Dead Three.js code should be removed
6. Need all wall cabinets solved (blue) not estimated (orange)
7. GPT sometimes returns above_base_ids referencing non-existent base IDs

---
