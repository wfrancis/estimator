#!/bin/bash
# Fast pipeline test: analyze once, then iterate on solver + rendering
# Usage: ./test_pipeline.sh [session_id]
# If no session_id provided, runs fresh analysis

API="http://localhost:8000"
TOTAL_RUN=114
SESSION=$1

if [ -z "$SESSION" ]; then
  echo "=== Step 1: Analyzing photo (slow, ~60s) ==="
  RESULT=$(curl -s -X POST "$API/cabinet/analyze" \
    -F "photo=@test_data/image.png" \
    -F 'known_references={}')
  SESSION=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['session_id'])")
  echo "Session: $SESSION"
  echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data['analysis']['cabinet_sections']:
    print(f\"  {s['id']:15s} type={s['cabinet_type']:20s} w={s['estimated_width']}  app={s['is_appliance']} appType={s['appliance_type']}  above={s.get('above_base_ids')}\")
"
else
  echo "=== Using cached session: $SESSION ==="
fi

echo ""
echo "=== Step 2: Solving (fast) ==="
SOLVE=$(curl -s -X POST "$API/cabinet/$SESSION/solve" \
  -H "Content-Type: application/json" \
  -d "{\"total_run\": $TOTAL_RUN}")
echo "$SOLVE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Confidence: {data['solved']['confidence']}\")
for c in data['solved']['cabinet_widths']:
    print(f\"  {c['section_id']:15s} w={c['width']:5}  src={c['source']}\")
for f in data['solved']['fillers']:
    print(f\"  filler: {f['position']} w={f['width']}\")
"

echo ""
echo "=== Step 3: Scene data (fast) ==="
SCENE=$(curl -s "$API/cabinet/$SESSION/scene")
echo "$SCENE" | python3 -c "
import sys, json
scene = json.load(sys.stdin)
print('Base cabinets:')
for b in scene['base_cabinets']:
    print(f\"  {b['id']:15s} x={b['x']:6.1f} w={b['width']:5.1f} h={b['height']:5.1f} app={b['is_appliance']} appType={b.get('appliance_type')}\")
print('Wall cabinets:')
for w in scene['wall_cabinets']:
    print(f\"  {w['id']:15s} x={w['x']:6.1f} w={w['width']:5.1f} h={w['height']:5.1f} gap={w['is_gap']}  above={w.get('above_base_ids')}\")
print(f\"Countertop: w={scene['countertop']['width']} d={scene['countertop']['depth']}\")
"

echo ""
echo "Session ID: $SESSION"
echo "Re-run without analysis: ./test_pipeline.sh $SESSION"
