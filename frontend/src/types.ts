// Types matching the FastAPI backend responses

export interface CabinetSection {
  id: string;
  cabinet_type: 'base' | 'wall' | 'wall_gap' | 'tall' | 'corner' | 'appliance_opening';
  position: string;
  door_count: number;
  drawer_count: number;
  estimated_width: number | null;
  estimated_height: number | null;
  confidence: number;
  needs_tape_measure: boolean;
  measurement_priority: 'required' | 'verify' | 'optional';
  notes: string;
  pixel_proportion: number;
  is_appliance: boolean;
  appliance_type: string | null;
  filler_detected_left: boolean;
  filler_detected_right: boolean;
  same_size_as: string[];
  above_base_ids: string[] | null;
}

export interface ReferenceObject {
  object_type: string;
  known_dimension: number | null;
  estimated_dimension: number | null;
  dimension_type: 'width' | 'height';
  reliability: number;
}

export interface PhotoAnalysis {
  cabinet_sections: CabinetSection[];
  reference_objects: ReferenceObject[];
  layout_description: string;
  wall_count: number;
  has_corner: boolean;
  photo_quality_notes: string[];
  suggested_additional_photos: string[];
}

export interface MeasurementChecklist {
  measurement_checklist: {
    must_measure: string[];
    verify_these: string[];
    optional: string[];
    overall_dimensions: string[];
  };
  section_count: number;
  tips: string[];
  instructions: string[];
}

export interface AnalyzeResponse {
  session_id: string;
  analysis: PhotoAnalysis;
  checklist: MeasurementChecklist;
}

export interface SolvedCabinet {
  section_id: string;
  width: number;
  confidence: number;
  source: 'solved' | 'measured' | 'appliance' | 'ambiguous';
  alternatives: number[];
}

export interface SolvedFiller {
  position: string;
  width: number;
  confidence: number;
}

export interface SolvedResult {
  cabinet_widths: SolvedCabinet[];
  fillers: SolvedFiller[];
  total_matches: boolean;
  confidence: number;
}

export interface SolveResponse {
  session_id: string;
  solved: SolvedResult;
  needs_more_input: string | null;
  disambiguation_reason: string | null;
  svg: string;
}

export interface TapMeasureResponse {
  session_id: string;
  updated_section: string;
  propagated_to: string[];
  value: number;
  needs_more_input: string | null;
  confidence: number;
  svg: string;
}

export interface ConfirmCabinet {
  section_id: string;
  width: number;
  source: string;
  confidence: number;
}

export interface ConfirmFiller {
  position: string;
  width: number;
}

export interface ConfirmReport {
  status: string;
  ready_for_production: boolean;
  total_run: number;
  cabinets: ConfirmCabinet[];
  fillers: ConfirmFiller[];
  confidence: number;
  warnings: string[];
}

export interface ConfirmResponse {
  session_id: string;
  report: ConfirmReport;
}

export type Step = 'upload' | 'analysis' | 'measure' | 'solved' | 'report';

// 3D Scene types
export interface SceneCabinet {
  id: string;
  type: string;
  x: number;
  width: number;
  depth: number;
  height: number;
  doors: number;
  drawers: number;
  is_appliance?: boolean;
  appliance_type?: string | null;
  confidence: number;
  source: string;
}

export interface SceneWallCabinet {
  id: string;
  type: string;
  x: number;
  width: number;
  depth: number;
  height: number;
  y_bottom: number;
  doors: number;
  drawers: number;
  is_gap: boolean;
  gap_type: string | null;
  confidence: number;
  source: string;
  above_base_ids: string[] | null;
}

export interface SceneFiller {
  x: number;
  width: number;
  position: string;
}

export interface SceneData {
  session_id: string;
  total_run: number | null;
  base_cabinets: SceneCabinet[];
  wall_cabinets: SceneWallCabinet[];
  fillers: SceneFiller[];
  countertop: {
    width: number;
    depth: number;
    height: number;
    y: number;
  };
}
