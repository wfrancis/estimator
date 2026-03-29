#!/usr/bin/env python3
"""
Cabinet Spec Tool API server.
- POST /api/extract — AI extraction (existing)
- /api/projects/* — Project CRUD
- /api/rooms/* — Room CRUD + auto-save
- /api/rooms/:id/images — Image upload
- /api/rooms/:id/extract — Extract + save to room
- /images/* — Static file serving for uploads
"""
import os
import json
import time
import uuid
from pathlib import Path
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from extract_cabinets import extract_from_bytes, PROMPT
import db

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Cabinet Spec Tool API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def startup():
    db.init_db()

# Static file serving for uploaded images
app.mount("/images", StaticFiles(directory=str(db.IMAGE_DIR)), name="images")


# ===========================================================================
# EXISTING — Extraction endpoint (unchanged API, kept for backwards compat)
# ===========================================================================
@app.post("/api/extract")
async def extract_cabinets_raw(
    image: UploadFile = File(...),
    photo: UploadFile = File(None),
    model: str = "claude-sonnet-4-6"
):
    """Extract cabinet spec from wireframe image (standalone, no project context)."""
    image_bytes = await image.read()
    if len(image_bytes) < 100:
        raise HTTPException(400, "Image too small or empty")

    photo_bytes = None
    if photo:
        photo_bytes = await photo.read()
        if len(photo_bytes) < 100:
            photo_bytes = None

    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "API key not set")

    try:
        spec = extract_from_bytes(image_bytes, api_key, model=model, photo_bytes=photo_bytes)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {str(e)}")

    return spec


# ===========================================================================
# PROJECTS
# ===========================================================================
@app.get("/api/projects")
async def list_projects():
    return db.list_projects()


@app.post("/api/projects")
async def create_project(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Project name is required")
    return db.create_project(name=name, notes=body.get("notes"))


@app.get("/api/projects/{pid}")
async def get_project(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.patch("/api/projects/{pid}")
async def update_project(pid: str, body: dict):
    allowed = {"name", "status", "notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "status" in updates and updates["status"] not in ("draft", "in_progress", "finalized"):
        raise HTTPException(400, "Invalid status")
    p = db.update_project(pid, **updates)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.delete("/api/projects/{pid}")
async def delete_project(pid: str):
    db.delete_project(pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/duplicate")
async def duplicate_project(pid: str):
    p = db.duplicate_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


# ===========================================================================
# ROOMS
# ===========================================================================
@app.post("/api/projects/{pid}/rooms")
async def create_room(pid: str, body: dict = None):
    if body is None:
        body = {}
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return db.create_room(
        project_id=pid,
        name=body.get("name"),
        sort_order=body.get("sort_order", len(p.get("rooms", [])))
    )


@app.get("/api/rooms/{rid}")
async def get_room(rid: str):
    r = db.get_room(rid)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


@app.patch("/api/rooms/{rid}")
async def update_room(rid: str, body: dict):
    allowed = {"name", "sort_order"}
    updates = {k: v for k, v in body.items() if k in allowed}
    r = db.update_room(rid, **updates)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


@app.patch("/api/rooms/{rid}/spec")
async def save_room_spec(rid: str, body: dict):
    """Auto-save endpoint with optimistic concurrency."""
    spec_json = body.get("spec_json")
    version = body.get("version", 0)
    if spec_json is None:
        raise HTTPException(400, "spec_json is required")
    spec_str = json.dumps(spec_json) if isinstance(spec_json, dict) else spec_json
    try:
        result = db.save_room_spec(rid, spec_str, version)
    except ValueError as e:
        if "conflict" in str(e).lower():
            raise HTTPException(409, str(e))
        raise HTTPException(404, str(e))
    return result


# Also accept POST for sendBeacon (which only supports POST)
@app.post("/api/rooms/{rid}/spec")
async def save_room_spec_post(rid: str, body: dict):
    return await save_room_spec(rid, body)


@app.delete("/api/rooms/{rid}")
async def delete_room(rid: str):
    db.delete_room(rid)
    return {"ok": True}


@app.post("/api/rooms/{rid}/duplicate")
async def duplicate_room(rid: str):
    r = db.duplicate_room(rid)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


# ===========================================================================
# IMAGES
# ===========================================================================
def _get_mime(data: bytes) -> str:
    """Detect MIME type from magic bytes."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if data[:3] == b'\xff\xd8\xff':
        return "image/jpeg"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return "image/webp"
    return "image/jpeg"  # fallback


def _generate_thumbnail(image_bytes: bytes, max_width: int = 300) -> bytes | None:
    """Generate a JPEG thumbnail. Returns None if Pillow fails."""
    try:
        from PIL import Image
        img = Image.open(BytesIO(image_bytes))
        img.verify()  # Validate it's a real image
        img = Image.open(BytesIO(image_bytes))  # Re-open after verify
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()
    except Exception:
        return None


@app.post("/api/rooms/{rid}/images")
async def upload_image(
    rid: str,
    image: UploadFile = File(...),
    type: str = Form(...)
):
    """Upload a photo or wireframe for a room."""
    if type not in ("photo", "wireframe"):
        raise HTTPException(400, "type must be 'photo' or 'wireframe'")

    room = db.get_room(rid)
    if not room:
        raise HTTPException(404, "Room not found")

    image_bytes = await image.read()
    if len(image_bytes) < 100:
        raise HTTPException(400, "Image too small or empty")
    if len(image_bytes) > 10_485_760:  # 10MB
        raise HTTPException(400, "Image too large (max 10MB)")

    mime = _get_mime(image_bytes)
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Invalid image format")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[mime]
    file_id = uuid.uuid4().hex[:12]

    # Create directory structure
    project_id = room["project_id"]
    img_dir = db.IMAGE_DIR / project_id / rid
    img_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir = img_dir / "thumbs"
    thumb_dir.mkdir(exist_ok=True)

    # Save full image
    file_path = f"{project_id}/{rid}/{file_id}.{ext}"
    full_path = db.IMAGE_DIR / file_path
    full_path.write_bytes(image_bytes)

    # Generate + save thumbnail
    thumb_path = None
    thumb_bytes = _generate_thumbnail(image_bytes)
    if thumb_bytes:
        thumb_path = f"{project_id}/{rid}/thumbs/{file_id}.jpg"
        (db.IMAGE_DIR / thumb_path).write_bytes(thumb_bytes)

    # Save to DB
    result = db.save_image(
        room_id=rid, img_type=type,
        filename=image.filename or f"{file_id}.{ext}",
        mime_type=mime, file_path=file_path, thumb_path=thumb_path
    )
    return result


# ===========================================================================
# ROOM EXTRACTION (project-aware)
# ===========================================================================
@app.post("/api/rooms/{rid}/extract")
async def extract_for_room(rid: str):
    """Run extraction using the room's uploaded images, save result."""
    room = db.get_room(rid)
    if not room:
        raise HTTPException(404, "Room not found")

    if not room.get("wireframe_id"):
        raise HTTPException(400, "Room has no wireframe image. Upload one first.")

    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "API key not set")

    # Load wireframe bytes
    with db.engine.connect() as conn:
        wire_row = conn.execute(
            db.images.select().where(db.images.c.id == room["wireframe_id"])
        ).mappings().first()
        photo_row = None
        if room.get("photo_id"):
            photo_row = conn.execute(
                db.images.select().where(db.images.c.id == room["photo_id"])
            ).mappings().first()

    if not wire_row:
        raise HTTPException(400, "Wireframe image not found in database")

    wire_path = db.IMAGE_DIR / wire_row["file_path"]
    if not wire_path.exists():
        raise HTTPException(400, "Wireframe image file missing from disk")

    wire_bytes = wire_path.read_bytes()
    photo_bytes = None
    if photo_row:
        photo_path = db.IMAGE_DIR / photo_row["file_path"]
        if photo_path.exists():
            photo_bytes = photo_path.read_bytes()

    # Run extraction
    model = "claude-sonnet-4-6"
    start_time = time.time()
    error_msg = None
    status = "success"
    spec = None
    try:
        spec = extract_from_bytes(wire_bytes, api_key, model=model, photo_bytes=photo_bytes)
    except Exception as e:
        error_msg = str(e)
        status = "failed"

    duration_ms = int((time.time() - start_time) * 1000)

    # Save extraction record
    db.save_extraction(
        room_id=rid,
        photo_id=room.get("photo_id"),
        wireframe_id=room.get("wireframe_id"),
        model=model,
        raw_response=json.dumps(spec) if spec else None,
        extracted_spec=spec,
        duration_ms=duration_ms,
        error_message=error_msg,
        status=status,
    )

    if status == "failed":
        raise HTTPException(500, f"Extraction failed: {error_msg}")

    # Auto-save extracted spec to room
    spec_str = json.dumps(spec)
    cab_count = len(spec.get("cabinets", [])) if spec else 0
    db.save_room_spec(rid, spec_str, room.get("spec_version", 0))

    return spec


# ===========================================================================
# EXISTING — Test endpoints
# ===========================================================================
@app.get("/")
async def root():
    return {"status": "ok", "service": "cabinet-spec-tool"}


@app.get("/health")
async def health():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    return {
        "status": "ok",
        "service": "cabinet-spec-tool",
        "api_key_set": bool(api_key),
    }


@app.get("/test-wireframe")
async def test_wireframe():
    from fastapi.responses import FileResponse
    path = "/Users/william/Downloads/Gemini_Generated_Image_xwr94dxwr94dxwr9.png"
    if os.path.exists(path):
        return FileResponse(path, media_type="image/png")
    return {"error": "No test wireframe found"}


@app.get("/test-photo")
async def test_photo():
    from fastapi.responses import FileResponse
    path = "/Users/william/Downloads/original_photo.jpg"
    if os.path.exists(path):
        return FileResponse(path, media_type="image/jpeg")
    return {"error": "No test photo found"}


if __name__ == "__main__":
    import uvicorn
    # Load .env
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().strip().splitlines():
            if "=" in line and not line.startswith("#"):
                key, val = line.split("=", 1)
                if not os.environ.get(key.strip()):
                    os.environ[key.strip()] = val.strip()
    uvicorn.run(app, host="0.0.0.0", port=8001)
