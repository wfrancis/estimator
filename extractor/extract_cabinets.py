#!/usr/bin/env python3
"""
Cabinet Wireframe → JSON Extractor
Usage: python extract_cabinets.py <image_path> --key <your_anthropic_api_key>
       python extract_cabinets.py wireframe.png --key sk-ant-...
       
Or set ANTHROPIC_API_KEY env var:
       export ANTHROPIC_API_KEY=sk-ant-...
       python extract_cabinets.py wireframe.png

Outputs: extracted_spec.json (and prints to terminal for copy/paste)
"""

import sys
import os
import json
import base64
import argparse
from pathlib import Path

try:
    import httpx
except ImportError:
    try:
        import requests as httpx
        httpx.Client = None  # flag that we're using requests
    except ImportError:
        print("Need either httpx or requests. Run: pip install httpx")
        sys.exit(1)

PROMPT = """You are a cabinet specification extraction system for professional cabinetmakers. Analyze this 2.5D wireframe image of cabinets and extract a COMPLETE structured specification.

RULES:
- Every visible cabinet unit gets an entry
- Base cabinets (floor-mounted, with toe kick) get IDs: B1, B2, B3... left to right
- Wall cabinets (upper, wall-mounted) get IDs: W1, W2, W3... left to right  
- Tall cabinets (floor-to-ceiling) get IDs: T1, T2...
- Use standard cabinet widths ONLY: 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48 inches
- Standard base height: 34.5", base depth: 24", wall depth: 12"
- Identify appliance openings (range, fridge, dishwasher) — gaps with no cabinet
- Identify range hood if visible
- For each cabinet, describe the front face top-to-bottom as sections
- Determine which wall cabinets align (left edge) above which base cabinets or appliances
- EVERY cabinet MUST have: id, type, label, row, width, height, depth, face.sections[]

FACE SECTION TYPES:
- "drawer": horizontal drawer front (specify height in inches, usually 6)
- "door": cabinet door (count: 1 for single, 2 for double; hinge_side: left/right/both)
- "false_front": non-functional panel like above a sink (specify height)
- "glass_door": door with glass panel
- "open": no door, open shelf

CABINET TYPES: base, base_sink, base_drawer_bank, base_pullout, base_spice, wall, wall_bridge, wall_stacker, tall_pantry, tall_oven

Respond with ONLY valid JSON. No markdown. No explanation. Structure:
{"base_layout":[{"ref":"B1"},{"type":"appliance","id":"range","label":"Range","width":30}],"wall_layout":[{"ref":"W1"},{"type":"hood","id":"hood","label":"Hood","width":30}],"alignment":[{"wall":"W1","base":"B1"}],"cabinets":[{"id":"B1","type":"base","label":"description","row":"base","width":18,"height":34.5,"depth":24,"face":{"sections":[{"type":"drawer","count":1,"height":6},{"type":"door","count":1,"hinge_side":"left"}]}}]}"""


def get_mime(path):
    # Detect from file magic bytes first, fall back to extension
    with open(path, 'rb') as f:
        header = f.read(12)
    if header[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if header[:2] == b'\xff\xd8':
        return 'image/jpeg'
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'image/webp'
    if header[:3] == b'GIF':
        return 'image/gif'
    ext = Path(path).suffix.lower()
    return {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif'}.get(ext, 'image/png')


def get_mime_from_bytes(data):
    """Detect MIME type from raw bytes."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:2] == b'\xff\xd8':
        return 'image/jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    if data[:3] == b'GIF':
        return 'image/gif'
    return 'image/png'


def extract_from_bytes(image_bytes, api_key, model="gemini-3.1-pro-preview", photo_bytes=None):
    """Extract cabinet spec from raw image bytes using Google Gemini. Returns dict (UCS JSON spec).
    If photo_bytes is provided, sends both the photo and wireframe for better accuracy."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    # Build content parts — photo first (if provided), then wireframe
    parts = []
    if photo_bytes:
        photo_mime = get_mime_from_bytes(photo_bytes)
        parts.append(types.Part.from_text(text="Above is the original photo of the space. Below is the wireframe drawing. Use BOTH to extract accurate cabinet specs."))
        parts.append(types.Part.from_bytes(data=photo_bytes, mime_type=photo_mime))

    mime = get_mime_from_bytes(image_bytes)
    parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime))
    parts.append(types.Part.from_text(text="Extract the complete cabinet specification from this wireframe. Return ONLY the JSON."))

    response = client.models.generate_content(
        model=model,
        contents=parts,
        config=types.GenerateContentConfig(
            system_instruction=PROMPT,
            max_output_tokens=16384,
            temperature=0.1,
            response_mime_type="application/json",
        ),
    )

    raw = response.text
    if not raw:
        raise ValueError("Empty response from Gemini")

    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError(f"No JSON found in response: {clean[:200]}")

    spec = json.loads(clean[start:end])

    if "cabinets" not in spec or not spec["cabinets"]:
        raise ValueError("No cabinets found in response")

    for c in spec["cabinets"]:
        c.setdefault("depth", 12 if c.get("row") == "wall" else 24)
        c.setdefault("height", 30 if c.get("row") == "wall" else 34.5)
        c.setdefault("width", 24)
        c.setdefault("face", {"sections": [{"type": "door", "count": 1}]})
        if not isinstance(c["face"].get("sections"), list):
            c["face"]["sections"] = [{"type": "door", "count": 1}]

    spec.setdefault("base_layout", [{"ref": c["id"]} for c in spec["cabinets"] if c.get("row") == "base"])
    spec.setdefault("wall_layout", [{"ref": c["id"]} for c in spec["cabinets"] if c.get("row") == "wall"])
    spec.setdefault("alignment", [])

    return spec


def extract(image_path, api_key, model="claude-sonnet-4-20250514"):
    if not os.path.exists(image_path):
        print(f"File not found: {image_path}")
        sys.exit(1)

    mime = get_mime(image_path)
    with open(image_path, 'rb') as f:
        image_b64 = base64.b64encode(f.read()).decode()

    size_kb = len(image_b64) * 3 / 4 / 1024
    print(f"Image: {image_path} ({mime}, {size_kb:.0f}KB)")
    print(f"Model: {model}")
    print("Calling Anthropic API...")

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }

    body = {
        "model": model,
        "max_tokens": 4096,
        "system": PROMPT,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": image_b64}},
                {"type": "text", "text": "Extract the complete cabinet specification from this wireframe. Return ONLY the JSON."}
            ]
        }]
    }

    resp = httpx.post("https://api.anthropic.com/v1/messages", headers=headers, json=body, timeout=120)

    if resp.status_code != 200:
        print(f"API Error {resp.status_code}: {resp.text[:500]}")
        sys.exit(1)

    data = resp.json()
    if "error" in data:
        print(f"API Error: {json.dumps(data['error'], indent=2)}")
        sys.exit(1)

    raw = "".join(b.get("text", "") for b in data.get("content", []))
    if not raw:
        print("Empty response from API")
        sys.exit(1)

    # Clean markdown fences
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    # Find JSON object
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start < 0 or end <= start:
        print("Could not find JSON in response:")
        print(clean[:500])
        sys.exit(1)

    try:
        spec = json.loads(clean[start:end])
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"Text: {clean[start:start+300]}")
        sys.exit(1)

    # Validate and fill defaults
    if "cabinets" not in spec or not spec["cabinets"]:
        print("No cabinets found in response")
        sys.exit(1)

    for c in spec["cabinets"]:
        c.setdefault("depth", 12 if c.get("row") == "wall" else 24)
        c.setdefault("height", 30 if c.get("row") == "wall" else 34.5)
        c.setdefault("width", 24)
        c.setdefault("face", {"sections": [{"type": "door", "count": 1}]})
        if not isinstance(c["face"].get("sections"), list):
            c["face"]["sections"] = [{"type": "door", "count": 1}]

    spec.setdefault("base_layout", [{"ref": c["id"]} for c in spec["cabinets"] if c.get("row") == "base"])
    spec.setdefault("wall_layout", [{"ref": c["id"]} for c in spec["cabinets"] if c.get("row") == "wall"])
    spec.setdefault("alignment", [])

    return spec


def print_summary(spec):
    bases = [c for c in spec["cabinets"] if c["row"] == "base"]
    walls = [c for c in spec["cabinets"] if c["row"] == "wall"]
    apps = [i for i in spec.get("base_layout", []) if "ref" not in i]

    print(f"\n{'='*60}")
    print(f"EXTRACTED: {len(bases)} base, {len(walls)} wall, {len(apps)} appliance openings")
    print(f"Alignment constraints: {len(spec.get('alignment', []))}")

    print(f"\nBASE ROW:")
    for item in spec.get("base_layout", []):
        if "ref" in item:
            c = next((x for x in spec["cabinets"] if x["id"] == item["ref"]), None)
            if c:
                secs = " → ".join(f"{s['type']}" + (f"x{s['count']}" if s.get('count', 1) > 1 else "") for s in c.get("face", {}).get("sections", []))
                print(f"  {c['id']}: {c['type']} {c['width']}\"w x {c['height']}\"h x {c['depth']}\"d  [{secs}]  {c.get('label','')}")
        else:
            print(f"  [{item.get('label', item.get('id', '?')).upper()}] {item.get('width', '?')}\"")

    print(f"\nWALL ROW:")
    for item in spec.get("wall_layout", []):
        if "ref" in item:
            c = next((x for x in spec["cabinets"] if x["id"] == item["ref"]), None)
            if c:
                secs = " → ".join(f"{s['type']}" + (f"x{s['count']}" if s.get('count', 1) > 1 else "") for s in c.get("face", {}).get("sections", []))
                print(f"  {c['id']}: {c['type']} {c['width']}\"w x {c['height']}\"h x {c['depth']}\"d  [{secs}]  {c.get('label','')}")
        else:
            print(f"  [{item.get('label', item.get('id', '?')).upper()}] {item.get('width', '?')}\"")

    if spec.get("alignment"):
        print(f"\nALIGNMENT:")
        for a in spec["alignment"]:
            print(f"  {a['wall']} ↔ {a['base']}")


def main():
    parser = argparse.ArgumentParser(description="Extract cabinet spec from wireframe image")
    parser.add_argument("image", help="Path to wireframe image (PNG, JPG, WebP)")
    parser.add_argument("--key", help="Anthropic API key (or set ANTHROPIC_API_KEY env var)")
    parser.add_argument("--model", default="claude-sonnet-4-20250514", help="Model to use")
    parser.add_argument("--output", "-o", default="extracted_spec.json", help="Output JSON file path")
    args = parser.parse_args()

    api_key = args.key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: Provide API key via --key flag or ANTHROPIC_API_KEY env var")
        print("  Get your key at: https://console.anthropic.com/settings/keys")
        sys.exit(1)

    spec = extract(args.image, api_key, args.model)
    print_summary(spec)

    # Write file
    with open(args.output, 'w') as f:
        json.dump(spec, f, indent=2)
    print(f"\nJSON written to: {args.output}")

    # Print pasteable JSON
    print(f"\n{'='*60}")
    print("COPY BELOW AND PASTE INTO PART 1:")
    print('='*60)
    print(json.dumps(spec, indent=2))
    print('='*60)


if __name__ == "__main__":
    main()
