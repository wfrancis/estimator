"""
Database layer — SQLAlchemy Core + SQLite.
Designed for clean migration to Postgres/Supabase (swap connection string).
"""
import os
import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    create_engine, MetaData, Table, Column, Text, Integer, Float,
    ForeignKey, Index, event, text
)

# ---------------------------------------------------------------------------
# Database path
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "estimator.db"
IMAGE_DIR = DATA_DIR / "images"
IMAGE_DIR.mkdir(exist_ok=True)

DATABASE_URL = f"sqlite:///{DB_PATH}"

# ---------------------------------------------------------------------------
# Engine + metadata
# ---------------------------------------------------------------------------
engine = create_engine(DATABASE_URL, echo=False)
metadata = MetaData()


def _gen_id():
    """Generate a short hex ID (16 chars)."""
    return os.urandom(8).hex()


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Table definitions (SQLAlchemy Core — no ORM)
# ---------------------------------------------------------------------------
projects = Table(
    "projects", metadata,
    Column("id", Text, primary_key=True, default=_gen_id),
    Column("name", Text, nullable=False),
    Column("status", Text, nullable=False, default="draft"),
    Column("notes", Text),
    Column("created_at", Text, nullable=False, default=_now),
    Column("updated_at", Text, nullable=False, default=_now),
    Column("deleted_at", Text),
)

rooms = Table(
    "rooms", metadata,
    Column("id", Text, primary_key=True, default=_gen_id),
    Column("project_id", Text, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
    Column("name", Text, nullable=False, default="Room 1"),
    Column("sort_order", Integer, nullable=False, default=0),
    Column("spec_json", Text),
    Column("spec_version", Integer, nullable=False, default=0),
    Column("cabinet_count", Integer, default=0),
    Column("photo_id", Text),
    Column("wireframe_id", Text),
    Column("created_at", Text, nullable=False, default=_now),
    Column("updated_at", Text, nullable=False, default=_now),
)

images = Table(
    "images", metadata,
    Column("id", Text, primary_key=True, default=_gen_id),
    Column("room_id", Text, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
    Column("type", Text, nullable=False),  # photo | wireframe
    Column("filename", Text, nullable=False),
    Column("mime_type", Text, nullable=False),
    Column("file_path", Text, nullable=False),
    Column("thumb_path", Text),
    Column("created_at", Text, nullable=False, default=_now),
)

extractions = Table(
    "extractions", metadata,
    Column("id", Text, primary_key=True, default=_gen_id),
    Column("room_id", Text, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
    Column("photo_id", Text),
    Column("wireframe_id", Text),
    Column("model", Text, nullable=False),
    Column("status", Text, nullable=False, default="success"),
    Column("raw_response", Text),
    Column("extracted_spec", Text),
    Column("cabinet_count", Integer, default=0),
    Column("duration_ms", Integer),
    Column("token_input_count", Integer),
    Column("token_output_count", Integer),
    Column("error_message", Text),
    Column("created_at", Text, nullable=False, default=_now),
)

exports = Table(
    "exports", metadata,
    Column("id", Text, primary_key=True, default=_gen_id),
    Column("room_id", Text, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False),
    Column("format", Text, nullable=False),
    Column("filename", Text, nullable=False),
    Column("file_path", Text),
    Column("spec_version", Integer),
    Column("spec_hash", Text),
    Column("created_at", Text, nullable=False, default=_now),
)

# Indexes
Index("idx_rooms_project", rooms.c.project_id)
Index("idx_images_room", images.c.room_id)
Index("idx_extractions_room", extractions.c.room_id)
Index("idx_exports_room", exports.c.room_id)


# ---------------------------------------------------------------------------
# SQLite pragmas (WAL mode, FK enforcement, busy timeout)
# ---------------------------------------------------------------------------
@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


# ---------------------------------------------------------------------------
# Create tables
# ---------------------------------------------------------------------------
def init_db():
    """Create all tables if they don't exist."""
    metadata.create_all(engine)


# ---------------------------------------------------------------------------
# CRUD helpers — Projects
# ---------------------------------------------------------------------------
def create_project(name: str, notes: str = None) -> dict:
    pid = _gen_id()
    now = _now()
    with engine.begin() as conn:
        conn.execute(projects.insert().values(
            id=pid, name=name, status="draft", notes=notes,
            created_at=now, updated_at=now
        ))
    return get_project(pid)


def get_project(pid: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            projects.select().where(projects.c.id == pid)
        ).mappings().first()
        if not row:
            return None
        p = dict(row)
        # Attach rooms summary
        room_rows = conn.execute(
            rooms.select().where(rooms.c.project_id == pid)
            .order_by(rooms.c.sort_order)
        ).mappings().all()
        p["rooms"] = [dict(r) for r in room_rows]
        # Compute aggregates
        p["room_count"] = len(p["rooms"])
        p["total_cabinets"] = sum(r.get("cabinet_count") or 0 for r in p["rooms"])
        # Get thumbnail from first room's photo
        p["thumb_url"] = None
        for r in p["rooms"]:
            if r.get("photo_id"):
                img = conn.execute(
                    images.select().where(images.c.id == r["photo_id"])
                ).mappings().first()
                if img and img.get("thumb_path"):
                    p["thumb_url"] = f"/images/{img['thumb_path']}"
                    break
        return p


def list_projects(include_deleted: bool = False) -> list[dict]:
    with engine.connect() as conn:
        q = projects.select().order_by(projects.c.updated_at.desc())
        if not include_deleted:
            q = q.where(projects.c.deleted_at.is_(None))
        rows = conn.execute(q).mappings().all()
        result = []
        for row in rows:
            p = dict(row)
            # Quick room/cabinet count
            room_rows = conn.execute(
                rooms.select().where(rooms.c.project_id == p["id"])
            ).mappings().all()
            p["room_count"] = len(room_rows)
            p["total_cabinets"] = sum(r.get("cabinet_count") or 0 for r in room_rows)
            # Thumbnail
            p["thumb_url"] = None
            for r in room_rows:
                if r.get("photo_id"):
                    img = conn.execute(
                        images.select().where(images.c.id == r["photo_id"])
                    ).mappings().first()
                    if img and img.get("thumb_path"):
                        p["thumb_url"] = f"/images/{img['thumb_path']}"
                        break
            result.append(p)
        return result


def update_project(pid: str, **kwargs) -> dict | None:
    kwargs["updated_at"] = _now()
    with engine.begin() as conn:
        conn.execute(
            projects.update().where(projects.c.id == pid).values(**kwargs)
        )
    return get_project(pid)


def delete_project(pid: str):
    with engine.begin() as conn:
        conn.execute(
            projects.update().where(projects.c.id == pid)
            .values(deleted_at=_now(), updated_at=_now())
        )


def duplicate_project(pid: str) -> dict | None:
    p = get_project(pid)
    if not p:
        return None
    new_p = create_project(name=f"{p['name']} (copy)", notes=p.get("notes"))
    for r in p.get("rooms", []):
        new_r = create_room(new_p["id"], name=r["name"], sort_order=r["sort_order"])
        if r.get("spec_json"):
            save_room_spec(new_r["id"], r["spec_json"], 0)
    return get_project(new_p["id"])


# ---------------------------------------------------------------------------
# CRUD helpers — Rooms
# ---------------------------------------------------------------------------
def create_room(project_id: str, name: str = None, sort_order: int = 0) -> dict:
    rid = _gen_id()
    now = _now()
    if not name:
        # Auto-name: "Room N" based on existing count
        with engine.connect() as conn:
            count = conn.execute(
                text("SELECT COUNT(*) FROM rooms WHERE project_id = :pid"),
                {"pid": project_id}
            ).scalar()
        name = f"Room {count + 1}"
    with engine.begin() as conn:
        conn.execute(rooms.insert().values(
            id=rid, project_id=project_id, name=name, sort_order=sort_order,
            spec_version=0, cabinet_count=0, created_at=now, updated_at=now
        ))
        # Touch project updated_at
        conn.execute(
            projects.update().where(projects.c.id == project_id)
            .values(updated_at=now)
        )
    return get_room(rid)


def get_room(rid: str) -> dict | None:
    with engine.connect() as conn:
        row = conn.execute(
            rooms.select().where(rooms.c.id == rid)
        ).mappings().first()
        if not row:
            return None
        r = dict(row)
        # Parse spec_json
        if r.get("spec_json"):
            try:
                r["spec"] = json.loads(r["spec_json"])
            except json.JSONDecodeError:
                r["spec"] = None
        else:
            r["spec"] = None
        # Attach image URLs
        for img_type in ("photo", "wireframe"):
            img_id = r.get(f"{img_type}_id")
            if img_id:
                img = conn.execute(
                    images.select().where(images.c.id == img_id)
                ).mappings().first()
                if img:
                    r[f"{img_type}_url"] = f"/images/{img['file_path']}"
                    if img.get("thumb_path"):
                        r[f"{img_type}_thumb_url"] = f"/images/{img['thumb_path']}"
        return r


def save_room_spec(rid: str, spec_json_str: str, expected_version: int) -> dict:
    """Auto-save endpoint: saves spec_json with optimistic concurrency."""
    now = _now()
    # Count cabinets from the spec
    cab_count = 0
    try:
        spec = json.loads(spec_json_str) if isinstance(spec_json_str, str) else spec_json_str
        cab_count = len(spec.get("cabinets", []))
        if isinstance(spec_json_str, dict):
            spec_json_str = json.dumps(spec_json_str)
    except (json.JSONDecodeError, TypeError):
        pass

    with engine.begin() as conn:
        # Check version
        row = conn.execute(
            text("SELECT spec_version, project_id FROM rooms WHERE id = :rid"),
            {"rid": rid}
        ).mappings().first()
        if not row:
            raise ValueError("Room not found")
        if row["spec_version"] != expected_version:
            raise ValueError(f"Version conflict: expected {expected_version}, got {row['spec_version']}")

        new_version = expected_version + 1
        conn.execute(
            rooms.update().where(rooms.c.id == rid).values(
                spec_json=spec_json_str, spec_version=new_version,
                cabinet_count=cab_count, updated_at=now
            )
        )
        # Touch project
        conn.execute(
            projects.update().where(projects.c.id == row["project_id"])
            .values(updated_at=now)
        )
    return {"version": new_version, "cabinet_count": cab_count}


def update_room(rid: str, **kwargs) -> dict | None:
    kwargs["updated_at"] = _now()
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT project_id FROM rooms WHERE id = :rid"), {"rid": rid}
        ).mappings().first()
        if not row:
            return None
        conn.execute(rooms.update().where(rooms.c.id == rid).values(**kwargs))
        conn.execute(
            projects.update().where(projects.c.id == row["project_id"])
            .values(updated_at=_now())
        )
    return get_room(rid)


def delete_room(rid: str):
    with engine.begin() as conn:
        conn.execute(rooms.delete().where(rooms.c.id == rid))


def duplicate_room(rid: str) -> dict | None:
    r = get_room(rid)
    if not r:
        return None
    new_r = create_room(r["project_id"], name=f"{r['name']} (copy)", sort_order=r["sort_order"] + 1)
    if r.get("spec_json"):
        save_room_spec(new_r["id"], r["spec_json"], 0)
    return get_room(new_r["id"])


# ---------------------------------------------------------------------------
# CRUD helpers — Images
# ---------------------------------------------------------------------------
def save_image(room_id: str, img_type: str, filename: str, mime_type: str,
               file_path: str, thumb_path: str = None) -> dict:
    """Save image record and update room's photo_id/wireframe_id."""
    iid = _gen_id()
    now = _now()
    with engine.begin() as conn:
        conn.execute(images.insert().values(
            id=iid, room_id=room_id, type=img_type, filename=filename,
            mime_type=mime_type, file_path=file_path, thumb_path=thumb_path,
            created_at=now
        ))
        # Update room's quick-access reference
        if img_type == "photo":
            conn.execute(rooms.update().where(rooms.c.id == room_id).values(
                photo_id=iid, updated_at=now
            ))
        elif img_type == "wireframe":
            conn.execute(rooms.update().where(rooms.c.id == room_id).values(
                wireframe_id=iid, updated_at=now
            ))
    return {"id": iid, "file_path": file_path, "thumb_path": thumb_path, "url": f"/images/{file_path}"}


# ---------------------------------------------------------------------------
# CRUD helpers — Extractions
# ---------------------------------------------------------------------------
def save_extraction(room_id: str, photo_id: str, wireframe_id: str,
                    model: str, raw_response: str, extracted_spec: dict,
                    duration_ms: int = None, token_input: int = None,
                    token_output: int = None, error_message: str = None,
                    status: str = "success") -> dict:
    eid = _gen_id()
    now = _now()
    cab_count = len(extracted_spec.get("cabinets", [])) if extracted_spec else 0
    spec_str = json.dumps(extracted_spec) if extracted_spec else None
    with engine.begin() as conn:
        conn.execute(extractions.insert().values(
            id=eid, room_id=room_id, photo_id=photo_id, wireframe_id=wireframe_id,
            model=model, status=status, raw_response=raw_response,
            extracted_spec=spec_str, cabinet_count=cab_count,
            duration_ms=duration_ms, token_input_count=token_input,
            token_output_count=token_output, error_message=error_message,
            created_at=now
        ))
    return {"id": eid, "cabinet_count": cab_count, "status": status}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def spec_hash(spec_json_str: str) -> str:
    return hashlib.sha256(spec_json_str.encode()).hexdigest()[:16]
