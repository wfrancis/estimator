/**
 * API client — all fetch wrappers for the backend.
 * Base URL defaults to http://localhost:8001.
 */
const BASE = "http://localhost:8001";

async function _fetch(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const listProjects = () => _fetch("/api/projects");

export const createProject = (name, notes) =>
  _fetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, notes }),
  });

export const getProject = (id) => _fetch(`/api/projects/${id}`);

export const updateProject = (id, data) =>
  _fetch(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteProject = (id) =>
  _fetch(`/api/projects/${id}`, { method: "DELETE" });

export const duplicateProject = (id) =>
  _fetch(`/api/projects/${id}/duplicate`, { method: "POST" });

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
export const createRoom = (projectId, name) =>
  _fetch(`/api/projects/${projectId}/rooms`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const getRoom = (id) => _fetch(`/api/rooms/${id}`);

export const updateRoom = (id, data) =>
  _fetch(`/api/rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const saveRoomSpec = (id, specJson, version) =>
  _fetch(`/api/rooms/${id}/spec`, {
    method: "PATCH",
    body: JSON.stringify({ spec_json: specJson, version }),
  });

export const deleteRoom = (id) =>
  _fetch(`/api/rooms/${id}`, { method: "DELETE" });

export const duplicateRoom = (id) =>
  _fetch(`/api/rooms/${id}/duplicate`, { method: "POST" });

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
export const uploadImage = (roomId, file, type) => {
  const formData = new FormData();
  formData.append("image", file);
  formData.append("type", type);
  return fetch(`${BASE}/api/rooms/${roomId}/images`, {
    method: "POST",
    body: formData,
  }).then((r) => {
    if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
    return r.json();
  });
};

export const imageUrl = (path) => (path ? `${BASE}${path}` : null);

// ---------------------------------------------------------------------------
// Extraction (project-aware)
// ---------------------------------------------------------------------------
export const extractForRoom = (roomId) =>
  _fetch(`/api/rooms/${roomId}/extract`, { method: "POST" });

// ---------------------------------------------------------------------------
// Legacy extraction (no project context, for "Try the Example")
// ---------------------------------------------------------------------------
export const extractRaw = (wireframeFile, photoFile) => {
  const formData = new FormData();
  formData.append("image", wireframeFile);
  if (photoFile) formData.append("photo", photoFile);
  return fetch(`${BASE}/api/extract`, {
    method: "POST",
    body: formData,
  }).then(async (r) => {
    if (!r.ok) {
      let detail = "";
      try {
        const j = await r.json();
        detail = j.detail || JSON.stringify(j);
      } catch {
        detail = await r.text();
      }
      throw new Error(detail || `HTTP ${r.status}`);
    }
    return r.json();
  });
};

// ---------------------------------------------------------------------------
// sendBeacon for auto-save on page unload (POST only, fire-and-forget)
// ---------------------------------------------------------------------------
export const beaconSaveSpec = (roomId, specJson, version) => {
  const blob = new Blob(
    [JSON.stringify({ spec_json: specJson, version })],
    { type: "application/json" }
  );
  navigator.sendBeacon(`${BASE}/api/rooms/${roomId}/spec`, blob);
};
