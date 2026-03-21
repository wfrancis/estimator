# Iteration Log — Cabinet Estimator 3D Pipeline

Track each iteration: what changed, what improved, what's still broken.
Goal: 95% visual match between photo and 3D render.

---

## Iteration 1 — Baseline (Previous Session)
**Date**: 2026-03-20
**Image**: test_data/image.png (white shaker cabinets, marble counter, stainless fridge)
**Total Run**: 108" (estimated)

### AI Analysis
- Detected 6 base sections, 5 wall sections
- Many sections marked as "appliance" incorrectly
- 9" widths for real cabinets (too narrow)

### 3D Render Issues
- Camera too close, couldn't see full layout
- All cabinets same height (34.5") including fridge
- Countertop spanned over fridge
- Appliances rendered as dark black boxes
- Labels overlapping
- No above-fridge cabinet detected

### Score: ~3/10

---

## Iteration 2 — Current
**Date**: 2026-03-20
**Session**: e2dd0bca-6f4f-4e7b-a09b-9f119b980ccb
**Total Run**: 114"

### Changes Made
1. **AI Prompts**: Room-agnostic language, explicit instruction to detect above-fridge cabinets
2. **Backend Scene**: Fridge gets 68" height, countertop excludes tall appliances
3. **3D Renderer**: Specialized FridgeAppliance and RangeAppliance components with stainless look
4. **Solver**: Empty appliance openings use AI estimated_width instead of defaulting to 24"
5. **Camera**: Pulled back significantly (totalWidth * 1.6), larger canvas

### AI Analysis Results
| Section | Type | AI Est Width | Appliance Type |
|---------|------|-------------|----------------|
| base_1 | base | 18" | - |
| base_2 | appliance_opening | 30" | range_30 |
| base_3 | base | 36" | sink_single_bowl |
| base_4 | base | 24" | - |
| base_5 | appliance_opening | 30" | refrigerator_30 |
| wall_1 | wall | 30" | - |
| wall_2 | wall | 15" | - |
| wall_gap_1 | wall_gap | 24" | range_hood |
| wall_3 | wall | 15" | - |
| wall_4 | wall | 30" | - |
| wall_5 | wall | 18" | - |
| wall_6 | wall | 30" (above fridge!) | - |

### Solver Results
| Section | Solved Width | Source | Issue |
|---------|-------------|--------|-------|
| base_1 | 9" | solved | TOO NARROW — AI said 18" |
| base_2 | 30" | solved | Correct (range) |
| base_3 | 30" | appliance | Close (AI said 36" sink) |
| base_4 | 15" | solved | TOO NARROW — AI said 24" |
| base_5 | 30" | appliance | Correct (fridge) |
| Total | 114" | | Matches target |

### Scene Data
- Fridge at 68" height — GOOD
- Countertop at 84" (excludes fridge) — GOOD
- Wall_6 above fridge detected — GOOD
- Wall cabinets have overlapping positions (wall_1 spans 0-39, wall_3 spans 9-69) — BAD, need fix

### 3D Render Issues
- Camera better but still not perfect framing
- Fridge visible as tall dark box (needs stainless look fix)
- Base_1 and base_4 too narrow due to solver compression
- Wall cabinets overlapping in x positions (above_base_ids logic produces overlaps)
- Range opening not rendering as empty space (shows as cabinet)

### Root Cause Analysis
**Solver Issue**: When sink (base_3) is locked as appliance at 30" and range (base_2) is locked at 30", remaining for base_1 + base_4 = 114 - 30 - 30 - 30 = 24". Solver splits 24" between two cabinets → 9" + 15". The sink should NOT be locked as appliance since its width varies (30" or 36").

**Wall Cabinet Overlap**: The `above_base_ids` logic calculates wall position from base positions, but when one wall section references multiple bases, it spans them. Multiple wall sections referencing overlapping bases causes overlap.

### Fixes Needed (General, not image-specific)
1. Solver: Don't lock sink cabinets as appliances (sinks come in 30" and 36" — they should be solved, not locked)
2. Wall cabinet positioning: Use sequential positioning instead of base-alignment when positions overlap
3. Range opening: Render as empty space (visible floor/wall) not as dark cabinet
4. Improve fridge stainless rendering in 3D

### Score: ~5/10

---

## Iteration 3 — Current Best
**Date**: 2026-03-20
**Total Run**: 114"

### Changes Made
1. Removed sinks from APPLIANCE_WIDTHS (sinks go in variable-width base cabinets)
2. Wall cabinet positioning: sequential left-to-right instead of overlapping above_base_ids logic
3. Wall cabinet scaling: total wall width scaled to match base total
4. Sink base renders as white cabinet with doors (not dark appliance)
5. Empty appliance openings render as visible floor/wall space
6. Fridge lighter stainless color (reduced metalness)

### Solved Widths
| Section | Width | Source | Correct? |
|---------|-------|--------|----------|
| base_1 | 18" | solved | Yes |
| base_2 | 30" | solved | Yes (range opening) |
| base_3 | 36" | appliance | Width OK but should be "solved" source |
| base_4 | 30" | appliance | Yes (fridge) |
| MISSING | ~18-24" | - | Cabinet between sink and fridge not detected |

### AI Evaluation Panel Scores
| Persona | Score | Key Issue |
|---------|-------|-----------|
| Cabinet Maker | 6.0 | Missing cabinet between sink and fridge |
| Cabinet Designer | 6.5 | Missing cabinet, wall proportions uniform |
| Project Manager | 7.0 | Can't send to shop with missing cabinet |
| Software Developer | 7.0 | AI non-determinism, wall solver weak |
| **Average** | **6.6** | **Below 7.0 threshold — needs re-plan** |

### Root Causes (General)
1. **AI detection inconsistency**: Same photo, different runs → different cabinet counts. Claude vision analysis is non-deterministic even at temp=0.
2. **Wall solver not constraining proportions**: All wall cabs get same width after scaling.
3. **No validation step**: No check that AI-detected cabinet count matches what's physically plausible.

---

## Iteration 4 — Multi-Pass Refinement
**Date**: 2026-03-20
**Total Run**: 114"

### Changes Made
1. **Multi-pass AI refinement**: Up to 5 passes (2 initial + 3 Sonnet refinement). Each pass compares JSON to photo and self-corrects.
2. **Post-analysis validation**: Splits base cabinets wider than 42" into two.
3. **Sink rendering**: White cabinet with doors, not dark appliance box.
4. **Vite proxy timeout**: Increased to 300s for multi-pass.

### Solved Widths
| Section | Width | Source | Photo Match |
|---------|-------|--------|-------------|
| base_1 | 12" | solved | Low — looks 15-18" in photo |
| base_2 | 30" | solved | Good (range opening) |
| base_3 | 24" | appliance | Low — looks 30-33" in photo |
| base_4 | 18" | solved | OK |
| base_5 | 30" | appliance | Good (fridge) |

### AI Evaluation Panel
| Persona | Score | Key Issue |
|---------|-------|-----------|
| Cabinet Maker | 7.5 | base_1 and base_3 widths off |
| Cabinet Designer | 7.5 | Wall cab proportions uniform |
| Project Manager | 8.0 | Good workflow, needs tape verification |
| Software Developer | 8.0 | Multi-pass architecture solid |
| **Average** | **7.75** | **Above 7.0 — fix top 3 issues** |

### Remaining Issues (General)
1. Solver compresses remaining cabinets when appliances take too much space
2. Wall solver needs proportional sizing
3. Sink source label shows "appliance" instead of "solved"

---

## Lessons Learned (Applicable to ALL images)

### L1: Sink ≠ Fixed Appliance
Sinks have variable base sizes (24", 30", 33", 36"). The solver should NOT lock sink cabinets to a fixed width. Only lock actual appliances with known exact widths (fridge, range, dishwasher).

### L2: Range Opening Width
An empty range opening with appliance_type like "range_30" should be locked at 30". This is a known appliance width even though no appliance is physically present.

### L3: Above-Fridge Cabinets Are Common
Most kitchens/laundry rooms with a fridge have a short (12-15") cabinet above it. The AI prompt must explicitly ask about this.

### L4: Camera Auto-Framing
Camera z-distance should be proportional to the widest dimension in the scene (max of total_run, max_cabinet_height). Use `max(totalWidth, maxHeight) * 1.5` for z.

### L5: Wall Cabinet Positioning
When using above_base_ids for alignment, must prevent overlapping. If calculated positions overlap, fall back to sequential left-to-right positioning.
