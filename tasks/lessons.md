# Lessons Learned

## 2026-03-28 — Refactor broke all editor wiring

**What happened:** A "frontend upgrade" commit decomposed App.jsx (871 lines) into 7 new files. The new RoomEditor.jsx was written from scratch instead of surgically extracted. Result: 3 child components (CabinetEditBar, InteractiveRender, GridEditor) received wrong/missing props. The entire edit workflow was broken while the render view looked fine visually.

**Specific failures:**
- `cab` prop renamed to `cabinet` without updating CabinetEditBar's signature — component got `undefined`
- 7 callback props dropped from CabinetEditBar (onDelete, onMoveLeft, onMoveRight, etc.)
- 3 callback props dropped from InteractiveRender (onDoubleClick, onContextMenu, onNudge)
- 5 props dropped from GridEditor (widthInputRef, onGapSelect, selectedGapItem, undo, redo)
- Props passed that components don't accept (silently ignored)
- Gap editing UI and context menu UI deleted entirely
- No runtime verification was done before committing

**Root cause:** LLM rewrote a file from memory instead of extracting by cut-and-paste. Got the structure right but lost the wiring. Also bundled backend + frontend + architecture into one giant commit with no verification.

**Rules to prevent recurrence:**
1. Never rewrite a file from scratch when extracting/splitting — copy-paste the exact code, then adjust imports
2. After any refactor, grep for every component's function signature and verify every call site passes matching props
3. One concern per commit — never bundle backend + frontend + architecture
4. Verify editing workflows specifically, not just visual rendering
