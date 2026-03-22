#!/usr/bin/env python3
"""
Extraction API server — wraps extract_cabinets.py as an HTTP endpoint.
POST /api/extract with multipart image → returns UCS JSON spec.
"""
import os
import json
import base64
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Import extraction logic
from extract_cabinets import extract_from_bytes, PROMPT

app = FastAPI(title="Cabinet Extractor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/extract")
async def extract_cabinets(image: UploadFile = File(...), model: str = "claude-sonnet-4-6"):
    """Extract cabinet spec from wireframe image."""
    image_bytes = await image.read()
    if len(image_bytes) < 100:
        raise HTTPException(400, "Image too small or empty")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "ANTHROPIC_API_KEY not set")

    try:
        spec = extract_from_bytes(image_bytes, api_key, model=model)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {str(e)}")

    return spec


@app.get("/")
async def root():
    return {"status": "ok", "service": "cabinet-extractor"}


@app.get("/health")
async def health():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    return {
        "status": "ok",
        "service": "cabinet-extractor",
        "api_key_set": bool(api_key),
    }


@app.get("/test-wireframe")
async def test_wireframe():
    """Serve the Gemini wireframe for testing."""
    from fastapi.responses import FileResponse
    path = "/Users/william/Downloads/Gemini_Generated_Image_xwr94dxwr94dxwr9.png"
    if os.path.exists(path):
        return FileResponse(path, media_type="image/png")
    return {"error": "No test wireframe found"}


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
