# Cabinet Spec Tool — Comprehensive QA Test Suite

## Test Environment
- **Dev server:** `npm run dev` on port 5173
- **Curl tests:** Hit localhost:5173 to verify server health
- **Chrome MCP tests:** Full interactive browser automation
- **Schedule:** Every 3 hours, automated via Claude scheduled task

---

## PHASE 1: Server Health & Build (curl)

### T1.1 Dev server responds
```
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```
Expected: 200

### T1.2 Main HTML loads with correct title
```
curl -s http://localhost:5173 | grep "Cabinet Spec Tool"
```
Expected: Match found

### T1.3 JS bundle loads without error
```
curl -s http://localhost:5173/src/App.jsx
```
Expected: 200, no 404

### T1.4 No build errors in server logs
Check preview_logs for errors

---

## PHASE 2: Home Screen (Chrome MCP)

### T2.1 Home screen renders all elements
- Navigate to localhost:5173
- Verify: "Cabinet Spec Tool" title visible
- Verify: "Upload Wireframe Image" section with file input
- Verify: "Load Built-in Example" button present
- Verify: "Pre-extracted: 5 base cabs, 7 wall cabs, range opening" text
- Verify: JSON textarea with placeholder
- Verify: "Load JSON" button
- Verify: No tab bar visible (tabs only show after loading spec)

### T2.2 No console errors on home screen
- Check console for errors — must be clean

### T2.3 No tab bar before spec loaded
- Verify Render/Plan/JSON tabs NOT visible on home screen

---

## PHASE 3: Load Example & Initial Render (Chrome MCP)

### T3.1 Load built-in example
- Click "Load Built-in Example"
- Verify: Tab bar appears (Render, Plan, JSON)
- Verify: Render tab is active (highlighted)
- Verify: Toolbar shows Undo, Redo, "12 cabs", "B:138"", "W:150""
- Verify: Bottom bar shows "Click a cabinet to edit." + Base / + Wall / Start Over

### T3.2 3D render shows all cabinets
- Verify wall row: W1 through W7 labels visible
- Verify base row: B1 through B5 labels visible
- Verify: RANGE gap visible between B2 and B3
- Verify: Dimension labels (15x42x12 for W1, etc.)

### T3.3 No console errors after loading
- Check console — must be clean

### T3.4 Cabinet count correct
- Toolbar shows "12 cabs"
- Base run: 138" (18+21+30+36+24+9)
- Wall run: 150" (15+15+33+33+18+15+15+6 spacer)

---

## PHASE 4: Cabinet Selection (Chrome MCP)

### T4.1 Select wall cabinet W1
- Click W1 in 3D render
- Verify: Blue highlight on W1
- Verify: Edit bar shows "W1" label in blue
- Verify: Type pills: wall (active), bridge, stacker
- Verify: Dimensions: 15w 42h 12d
- Verify: FACE: Door (R) x + Section

### T4.2 Select wall cabinet W3 (double door)
- Click W3
- Verify: Dimensions: 33w 30h 12d
- Verify: FACE: Door x2 x + Section

### T4.3 Select base cabinet B1
- Click B1
- Verify: Orange/red highlight on B1
- Verify: Edit bar shows "B1" in red
- Verify: Type pills: base (active), sink, drawer bank, pullout, spice
- Verify: Dimensions: 18w 34.5h 24d
- Verify: FACE: Drawer 6" x + Door (L) x + Section

### T4.4 Select base cabinet B3 (sink)
- Click B3
- Verify: Type "sink" highlighted
- Verify: Dimensions: 36w 34.5h 24d
- Verify: FACE: False Front 6" x + Door x2 x + Section

### T4.5 Select base cabinet B5 (narrow 9")
- Click B5
- Verify: Width shows 9"
- Verify: Face sections rendered correctly for narrow cabinet

### T4.6 Deselect by clicking empty space
- Click on white area (no cabinet)
- Verify: No highlight on any cabinet
- Verify: Bottom bar shows "Click a cabinet to edit." + buttons

### T4.7 Rapid selection switching
- Click W1, then immediately click B3, then W7
- Verify: Each click selects the new cabinet, deselects previous
- Verify: Edit bar updates correctly each time
- Verify: No console errors

---

## PHASE 5: Dimension Editing (Chrome MCP)

### T5.1 Change width via input
- Select W2 (15")
- Triple-click width input, type "30", press Enter
- Verify: Render updates — W2 visually wider
- Verify: Dimension label changes to 30x42x12
- Verify: Wall total updates (150 + 15 = 165")
- Verify: No overlap with adjacent cabinets

### T5.2 Change height via input
- Select B1 (34.5h)
- Triple-click height input, type "30", press Enter
- Verify: Render updates — B1 visually shorter
- Verify: Dimension label shows 18x30x24

### T5.3 Change depth via input
- Select W1 (12d)
- Triple-click depth input, type "15", press Enter
- Verify: Dimension label shows 15x42x15

### T5.4 Invalid width (zero)
- Select any cabinet
- Clear width input, type "0", press Enter
- Verify: Value rejected or reverts to previous valid value

### T5.5 Invalid width (negative)
- Clear width input, type "-5", press Enter
- Verify: Value rejected or reverts

### T5.6 Very large width
- Type "100" for width
- Verify: Renders without crash, layout adjusts

### T5.7 Tab key advances to next cabinet (CabinetEditBar)
- Select B1, press Tab in width input
- Verify: Focus moves to next input or next cabinet

---

## PHASE 6: Type Changing (Chrome MCP)

### T6.1 Change base type: base to sink
- Select B2 (base type)
- Click "sink" pill
- Verify: "sink" pill highlighted, "base" deselected
- Verify: Dimensions preserved
- Verify: Face sections preserved

### T6.2 Change base type: sink to drawer bank
- Select B3 (sink type)
- Click "drawer bank" pill
- Verify: Type changed

### T6.3 Change wall type: wall to bridge
- Select W3
- Click "bridge" pill
- Verify: Type changed to bridge

### T6.4 Change wall type: wall to stacker
- Select W6
- Click "stacker" pill
- Verify: Type changed

### T6.5 Undo type change
- After changing type, click Undo
- Verify: Type reverts to original

---

## PHASE 7: Face Section Editing (Chrome MCP)

### T7.1 Click section pill to edit
- Select B3, click "Door x2" pill
- Verify: Inline editor appears — Door dropdown, count 2

### T7.2 Change door count 2 to 1, hinge appears
- Change count from 2 to 1
- Verify: Hinge selector appears (Left/Right)
- Verify: Pill updates to "Door" (not "Door x2")
- Verify: Render shows single door

### T7.3 Change hinge side
- Change hinge from Left to Right
- Verify: Pill shows "Door (R)"
- Verify: Render updates door handle position

### T7.4 Change section type Door to Drawer
- Click section pill, change dropdown from Door to Drawer
- Verify: Pill changes to "Drawer"
- Verify: Height input appears (ht "auto")
- Verify: Hinge selector disappears

### T7.5 Set drawer height
- In drawer editor, type "6" for height
- Verify: Pill updates to "Drawer 6""
- Verify: Render shows drawer at correct height

### T7.6 Change to False Front
- Change dropdown to False Front
- Verify: Pill shows "False Front"
- Verify: Height input appears

### T7.7 Change to Glass Door
- Change dropdown to Glass Door
- Verify: Count and hinge selectors appear appropriately

### T7.8 Add section via + Section
- Click "+ Section"
- Verify: New "Door" section added at end of sections list
- Verify: New pill appears in face row

### T7.9 Remove section via x
- Click x on a section pill
- Verify: Section removed
- Verify: Pill disappears
- Verify: Render updates

### T7.10 Multiple sections (3+)
- Add 3 sections to a cabinet
- Verify: All pills render without overflow
- Verify: Each pill editable

---

## PHASE 8: Add / Delete Cabinets (Chrome MCP)

### T8.1 Add base cabinet via + Base
- Deselect all, click "+ Base"
- Verify: New base cabinet added at end of base layout
- Verify: Auto-selected
- Verify: Count increments (12 -> 13)
- Verify: Base total increases by default width (18")

### T8.2 Add wall cabinet via + Wall
- Deselect all, click "+ Wall"
- Verify: New wall cabinet added at end of wall layout
- Verify: Auto-selected
- Verify: Count increments

### T8.3 Add cabinet after selected (+ Cab)
- Select B4, click "+ Cab"
- Verify: New cabinet inserted after B4 (before B5)
- Verify: New cabinet auto-selected
- Verify: Count and totals update

### T8.4 Delete cabinet via Del
- Select the newly added cabinet, click "Del"
- Verify: Cabinet removed
- Verify: Deselected (bottom bar shows default)
- Verify: Count and totals revert

### T8.5 Delete first cabinet
- Select B1, click "Del"
- Verify: B1 removed
- Verify: Layout starts with B2
- Undo to restore

### T8.6 Delete last cabinet
- Select B5, click "Del"
- Verify: B5 removed
- Verify: Layout ends with B4
- Undo to restore

### T8.7 Delete all cabinets one by one
- Delete all base cabinets one by one
- Verify: No crash when last cabinet deleted
- Verify: Empty state handled gracefully
- Undo all to restore

---

## PHASE 9: Undo / Redo (Chrome MCP)

### T9.1 Undo single action
- Change W1 width from 15 to 30
- Click Undo
- Verify: Width reverts to 15
- Verify: Render updates

### T9.2 Redo after undo
- Click Redo
- Verify: Width goes back to 30

### T9.3 Multiple undo
- Make 3 changes (width, type, add cabinet)
- Click Undo 3 times
- Verify: All 3 reverted in correct order

### T9.4 Undo after redo
- Undo a change, Redo it, then Undo again
- Verify: Correct state at each step

### T9.5 New action clears redo stack
- Make a change, Undo, make a different change
- Verify: Redo button disabled (future cleared)

### T9.6 Undo disabled when no history
- Load fresh example
- Verify: Undo button disabled (grayed out)

### T9.7 Keyboard shortcuts
- Press Cmd+Z to undo
- Press Cmd+Shift+Z to redo
- Verify: Same behavior as button clicks

---

## PHASE 10: Plan Tab (Grid Editor) (Chrome MCP)

### T10.1 Switch to Plan tab
- Click "Plan" tab
- Verify: Grid editor renders with ruler, WALL row, BASE row
- Verify: All cabinets visible with correct widths

### T10.2 Select cabinet in grid
- Click a cabinet block in the grid
- Verify: White highlight/glow on selected block
- Verify: Edit bar appears at bottom

### T10.3 Cabinet widths match Render
- Compare widths shown in grid vs what was in Render
- Verify: All widths match exactly

### T10.4 Gaps shown correctly
- Verify: RANGE gap shown between B2 and B3 (dashed, 30")
- Verify: Any spacers shown as thin dashed blocks

### T10.5 Drag to resize width
- Select a cabinet, drag right edge to resize
- Verify: Width changes live during drag
- Verify: On release, width committed
- Verify: Render tab reflects new width

### T10.6 Arrow key nudge
- Select B5, press Right arrow multiple times
- Verify: Spacer/gap appears before B5
- Verify: Gap width increases with each press

### T10.7 Zoom controls
- Click + to zoom in, - to zoom out
- Verify: Grid zooms, text remains readable
- Verify: 100% button resets zoom

### T10.8 Switch back to Render
- Switch to Render tab
- Verify: All Plan tab changes reflected in 3D render

---

## PHASE 11: Filler / Gap Operations (Chrome MCP)

### T11.1 Add filler before cabinet
- Select B3, click "Filler"
- Verify: 3" filler added before B3 in layout
- Verify: Base total increases by 3

### T11.2 Large gap doesn't cause overlap
- Add large filler (50") in wall layout
- Switch to Render
- Verify: No overlapping cabinets in render
- Verify: Cabinets pushed right, not stacked

---

## PHASE 12: JSON Tab (Chrome MCP)

### T12.1 Switch to JSON tab
- Click "JSON" tab
- Verify: JSON textarea shows spec
- Verify: Valid JSON (parseable)

### T12.2 JSON reflects edits
- Make edits in Render, switch to JSON
- Verify: JSON shows updated values (new widths, types, etc.)

---

## PHASE 13: Cross-Tab State Sync (Chrome MCP)

### T13.1 Edit in Render, verify in Plan
- Select W2 in Render, change width to 30
- Switch to Plan
- Verify: W2 shows 30" in grid

### T13.2 Edit in Plan, verify in Render
- In Plan tab, select B4 and change width
- Switch to Render
- Verify: B4 shows new width in 3D render

### T13.3 Selection persists across tabs
- Select W3 in Render, switch to Plan
- Verify: W3 highlighted in grid (or at least selected in edit bar)
- Switch back to Render
- Verify: W3 still selected

---

## PHASE 14: Start Over / Reset (Chrome MCP)

### T14.1 Start Over returns to home
- Click "Start Over"
- Verify: Returns to home screen
- Verify: No tabs visible
- Verify: No console errors

### T14.2 Reload example after Start Over
- After Start Over, click "Load Built-in Example"
- Verify: Fresh state — 12 cabs, original dimensions
- Verify: Previous edits NOT preserved

---

## PHASE 15: Render Alignment & Overlap (Chrome MCP)

### T15.1 Expand W2 to 30", verify no overlap
- Load example, select W2, change to 30"
- Take screenshot
- Verify: W2 expands, W3 pushed right, no cabinet overlapping

### T15.2 Expand W3 to 48", verify no overlap
- Change W3 to 48"
- Verify: W4 and subsequent cabinets pushed right
- Verify: No visual overlap in render

### T15.3 Multiple width changes, verify integrity
- Change W1=24, W2=24, W3=24
- Verify: All render correctly without overlap
- Verify: Totals update correctly

---

## PHASE 16: Edge Cases (Chrome MCP)

### T16.1 Very narrow cabinet (9")
- Select B5 (9")
- Verify: Renders correctly, label visible
- Change to 6" — verify minimum supported

### T16.2 Very wide cabinet (48")
- Change B3 to 48"
- Verify: Renders correctly, doesn't break layout

### T16.3 All same height
- Set all wall cabinets to 30" height
- Verify: Render shows them same height

### T16.4 Mixed heights
- W1=42, W3=30, W6=18
- Verify: Render shows height differences correctly

### T16.5 Rapid clicks
- Click 10 different cabinets in quick succession
- Verify: No crash, no stale state, last click wins

### T16.6 Double-click cabinet in grid
- Double-click a cabinet in Plan tab grid
- Verify: Focus jumps to width input for editing

---

## PHASE 17: Performance (Chrome MCP)

### T17.1 Responsive after 20 edits
- Make 20 sequential edits (widths, types, add/delete)
- Verify: UI remains responsive
- Verify: No increasing lag

### T17.2 Undo 20 times
- After 20 edits, undo all 20
- Verify: Each undo is responsive
- Verify: Final state matches original

---

## PHASE 18: Visual Regression (Chrome MCP Screenshots)

### T18.1 Default render screenshot
- Load example, take screenshot
- Compare with baseline (cabinets correctly positioned, labeled, sized)

### T18.2 Selected cabinet screenshot
- Select W3, take screenshot
- Verify: Blue highlight visible, edit bar at bottom

### T18.3 Plan view screenshot
- Switch to Plan tab, take screenshot
- Verify: Grid layout correct, labels visible, ruler present

---

## Test Execution Order

1. Phase 1 (curl — server health)
2. Phase 2 (Chrome — home screen)
3. Phase 3 (Chrome — load & initial render)
4. Phase 4 (Chrome — selection)
5. Phase 5 (Chrome — dimensions)
6. Phase 6 (Chrome — types)
7. Phase 7 (Chrome — face sections)
8. Phase 8 (Chrome — add/delete)
9. Phase 9 (Chrome — undo/redo)
10. Phase 10 (Chrome — Plan tab)
11. Phase 11 (Chrome — fillers)
12. Phase 12 (Chrome — JSON)
13. Phase 13 (Chrome — cross-tab sync)
14. Phase 14 (Chrome — Start Over)
15. Phase 15 (Chrome — alignment/overlap)
16. Phase 16 (Chrome — edge cases)
17. Phase 17 (Chrome — performance)
18. Phase 18 (Chrome — visual regression)

## Reporting

After each run, output:
- Total tests: X
- Passed: X
- Failed: X (with details)
- Screenshots of any failures
- Timestamp
