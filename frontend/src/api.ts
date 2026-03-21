import type {
  AnalyzeResponse,
  SolveResponse,
  TapMeasureResponse,
  ConfirmResponse,
  SceneData,
  LayoutBox,
  ChatResponse,
} from './types';

const API_BASE = '/cabinet';

export async function analyzePhoto(
  photo: File,
  knownReferences?: Record<string, number>,
  totalRun?: number
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('photo', photo);
  if (knownReferences) {
    formData.append('known_references', JSON.stringify(knownReferences));
  }
  if (totalRun) {
    formData.append('total_run', totalRun.toString());
  }

  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Analyze failed: ${res.status}`);
  return res.json();
}

export async function solveWidths(
  sessionId: string,
  totalRun: number,
  additionalMeasurements?: Record<string, number>
): Promise<SolveResponse> {
  const res = await fetch(`${API_BASE}/${sessionId}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      total_run: totalRun,
      additional_measurements: additionalMeasurements || {},
    }),
  });
  if (!res.ok) throw new Error(`Solve failed: ${res.status}`);
  return res.json();
}

export async function getElevationSvg(sessionId: string): Promise<string> {
  const res = await fetch(`${API_BASE}/${sessionId}/elevation`);
  if (!res.ok) throw new Error(`Elevation failed: ${res.status}`);
  return res.text();
}

export async function tapMeasure(
  sessionId: string,
  sectionId: string,
  dimension: string,
  value: number
): Promise<TapMeasureResponse> {
  const params = new URLSearchParams({
    section_id: sectionId,
    dimension,
    value: value.toString(),
  });
  const res = await fetch(`${API_BASE}/${sessionId}/tap-measure?${params}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Tap-measure failed: ${res.status}`);
  return res.json();
}

export async function confirmMeasurements(
  sessionId: string
): Promise<ConfirmResponse> {
  const res = await fetch(`${API_BASE}/${sessionId}/confirm`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
  return res.json();
}

export async function getSceneData(sessionId: string): Promise<SceneData> {
  const res = await fetch(`${API_BASE}/${sessionId}/scene`);
  if (!res.ok) throw new Error(`Scene data failed: ${res.status}`);
  return res.json();
}

export async function updateLayout(
  sessionId: string,
  boxes: LayoutBox[],
  totalRun?: number
): Promise<SolveResponse> {
  const res = await fetch(`${API_BASE}/${sessionId}/update-layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxes, total_run: totalRun }),
  });
  if (!res.ok) throw new Error(`Update layout failed: ${res.status}`);
  return res.json();
}

export async function chatWithAssistant(
  sessionId: string,
  message: string,
  currentScene: SceneData
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, current_scene: currentScene }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  return res.json();
}

export async function exportConfig(sessionId: string): Promise<object> {
  const res = await fetch(`${API_BASE}/${sessionId}/export`);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.json();
}
