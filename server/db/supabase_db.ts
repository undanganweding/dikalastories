import { getSupabaseClient } from './supabase_client';
import { attachEphemeralApiKey } from '../db';
import {
  Project,
  ProjectFoundation,
  CharacterBible,
  LocationBible,
  ObjectBible,
  Scene,
  Shot,
  VideoPrompt,
  PipelineLogEvent,
  StageExecutionTelemetry,
  ProjectFullData,
  StoryArchitecture,
  CharacterContinuityState,
  ContinuitySnapshot,
  ApprovedCostumeTransition,
  AIProvider,
  AICredential,
  AIModel,
  AIUsage,
  AIHealth,
  AIRoutingPolicy,
} from '../../src/types';
import { sceneToVirtualShotAdapter } from '../scene_adapter';
import { recommendSceneTone } from '../narrative_tone';

// Helper to remove undefined properties before inserting/updating JSON or rows
function sanitizeForSupabase<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizeForSupabase(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}

/**
 * Server-side Supabase Data Access Implementation.
 * Implements the exact interface contract of server/db.ts.
 */
export const supabaseDb = {
  // ---------------------------------------------------------------------------
  // PROJECTS & FULL DATA
  // ---------------------------------------------------------------------------
  async listProjects(): Promise<Project[]> {
    const supabase = getSupabaseClient();
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[Supabase Error listProjects]: ${error.message}`);
    if (!projects) return [];

    const projectIds = projects.map(p => p.id);
    if (projectIds.length === 0) return [];

    const [resRes, narRes, prodRes, assetRes] = await Promise.all([
      supabase.from('project_research_packages').select('*').in('project_id', projectIds),
      supabase.from('project_narrative_blueprints').select('*').in('project_id', projectIds),
      supabase.from('project_production_plans').select('*').in('project_id', projectIds),
      supabase.from('project_asset_graphs').select('*').in('project_id', projectIds),
    ]);

    const resMap = new Map((resRes.data || []).map(r => [r.project_id, r]));
    const narMap = new Map((narRes.data || []).map(n => [n.project_id, n]));
    const prodMap = new Map((prodRes.data || []).map(p => [p.project_id, p]));
    const assetMap = new Map((assetRes.data || []).map(a => [a.project_id, a]));

    return projects.map(p => {
      const res = resMap.get(p.id) || {};
      const nar = narMap.get(p.id) || {};
      const prod = prodMap.get(p.id) || {};
      const asset = assetMap.get(p.id) || {};

      return {
        ...p,
        research_package: res.research_package || (p as any).research_package,
        research_dossier: res.research_dossier || (p as any).research_dossier,
        source_registry: res.source_registry || (p as any).source_registry,
        context_package: res.context_package || (p as any).context_package,

        narrative_blueprint: nar.narrative_blueprint || (p as any).narrative_blueprint,
        full_story: nar.full_story || (p as any).full_story,
        narrative_style_config: nar.narrative_style_config || (p as any).narrative_style_config,

        generation_plan: prod.generation_plan || (p as any).generation_plan,
        quota_profiles: prod.quota_profiles || (p as any).quota_profiles,
        ai_call_budget: prod.ai_call_budget || (p as any).ai_call_budget,
        production_readiness: prod.production_readiness || (p as any).production_readiness,
        finalization_report: prod.finalization_report || (p as any).finalization_report,
        asset_integrity_reports: prod.asset_integrity_reports || (p as any).asset_integrity_reports,

        asset_graph: asset.asset_graph || (p as any).asset_graph,
        validation_result: asset.validation_result || (p as any).validation_result,
        consistency_reports: asset.consistency_reports || (p as any).consistency_reports,
      } as Project;
    });
  },

  async getProject(id: string): Promise<Project | null> {
    const supabase = getSupabaseClient();
    const { data: p, error } = await supabase.from('projects').select('*').eq('id', id).single();
    if (error || !p) return null;

    const [resRes, narRes, prodRes, assetRes] = await Promise.all([
      supabase.from('project_research_packages').select('*').eq('project_id', id).maybeSingle(),
      supabase.from('project_narrative_blueprints').select('*').eq('project_id', id).maybeSingle(),
      supabase.from('project_production_plans').select('*').eq('project_id', id).maybeSingle(),
      supabase.from('project_asset_graphs').select('*').eq('project_id', id).maybeSingle(),
    ]);

    const res = resRes.data || {};
    const nar = narRes.data || {};
    const prod = prodRes.data || {};
    const asset = assetRes.data || {};

    return attachEphemeralApiKey({
      ...p,
      research_package: res.research_package,
      research_dossier: res.research_dossier,
      source_registry: res.source_registry,
      context_package: res.context_package,

      narrative_blueprint: nar.narrative_blueprint,
      full_story: nar.full_story,
      narrative_style_config: nar.narrative_style_config,

      generation_plan: prod.generation_plan,
      quota_profiles: prod.quota_profiles,
      ai_call_budget: prod.ai_call_budget,
      production_readiness: prod.production_readiness,
      finalization_report: prod.finalization_report,
      asset_integrity_reports: prod.asset_integrity_reports,

      asset_graph: asset.asset_graph,
      validation_result: asset.validation_result,
      consistency_reports: asset.consistency_reports,
    } as Project);
  },

  async getFullProjectData(projectId: string): Promise<ProjectFullData | null> {
    const project = await this.getProject(projectId);
    if (!project) return null;

    const [
      foundation,
      characters,
      locations,
      objects,
      scenes,
      storyArchitecture,
      continuityState,
    ] = await Promise.all([
      this.getProjectFoundation(projectId),
      this.getCharacters(projectId),
      this.getLocations(projectId),
      this.getObjects(projectId),
      this.getScenes(projectId),
      this.getStoryArchitecture(projectId),
      this.getCharacterContinuityStates(projectId),
    ]);

    return {
      project,
      foundation: foundation || null,
      characters,
      locations,
      objects,
      scenes,
      story_architecture: storyArchitecture || null,
      continuity_states: continuityState.length > 0 ? continuityState : undefined,
    };
  },

  async saveProject(project: Project): Promise<Project> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const {
      research_package, research_dossier, source_registry, context_package,
      narrative_blueprint, full_story, narrative_style_config,
      generation_plan, quota_profiles, ai_call_budget, production_readiness, finalization_report, asset_integrity_reports,
      asset_graph, validation_result, consistency_reports,
      ...coreProject
    } = project as any;

    const coreData = sanitizeForSupabase({
      ...coreProject,
      updated_at: now,
      created_at: project.created_at || now,
    });

    const { error: pErr } = await supabase.from('projects').upsert(coreData);
    if (pErr) throw new Error(`[Supabase Error saveProject]: ${pErr.message}`);

    await Promise.all([
      supabase.from('project_research_packages').upsert(sanitizeForSupabase({
        project_id: project.id,
        research_package, research_dossier, source_registry, context_package,
        updated_at: now,
      })),
      supabase.from('project_narrative_blueprints').upsert(sanitizeForSupabase({
        project_id: project.id,
        narrative_blueprint, full_story, narrative_style_config,
        updated_at: now,
      })),
      supabase.from('project_production_plans').upsert(sanitizeForSupabase({
        project_id: project.id,
        generation_plan, quota_profiles, ai_call_budget, production_readiness, finalization_report, asset_integrity_reports,
        updated_at: now,
      })),
      supabase.from('project_asset_graphs').upsert(sanitizeForSupabase({
        project_id: project.id,
        asset_graph, validation_result, consistency_reports,
        updated_at: now,
      })),
    ]);

    return project;
  },

  async updateProject(projectId: string, updater: (project: Project) => Project): Promise<Project | null> {
    const current = await this.getProject(projectId);
    if (!current) return null;
    const updated = updater({ ...current });
    await this.saveProject(updated);
    return updated;
  },

  async deleteProject(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(`[Supabase Error deleteProject]: ${error.message}`);
    return true;
  },

  async resetProjectState(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    await Promise.all([
      supabase.from('scenes').delete().eq('project_id', id),
      supabase.from('shots').delete().eq('project_id', id),
      supabase.from('video_prompts').delete().eq('project_id', id),
      supabase.from('pipeline_logs').delete().eq('project_id', id),
      supabase.from('stage_telemetry').delete().eq('project_id', id),
      supabase.from('continuity_states').delete().eq('project_id', id),
      supabase.from('continuity_snapshots').delete().eq('project_id', id),
    ]);

    await supabase.from('projects').update({
      status: 'draft',
      current_stage: 1,
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    return true;
  },

  // ---------------------------------------------------------------------------
  // PROJECT FOUNDATION
  // ---------------------------------------------------------------------------
  async getProjectFoundation(projectId: string): Promise<ProjectFoundation | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('project_foundations')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error || !data) return null;
    return { ...data, id: projectId } as ProjectFoundation;
  },

  async saveProjectFoundation(foundation: ProjectFoundation): Promise<ProjectFoundation> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      ...foundation,
      project_id: foundation.project_id || foundation.id,
      updated_at: now,
    });

    const { error } = await supabase.from('project_foundations').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveProjectFoundation]: ${error.message}`);
    return foundation;
  },

  // ---------------------------------------------------------------------------
  // CHARACTERS
  // ---------------------------------------------------------------------------
  async getCharacters(projectId: string): Promise<CharacterBible[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', projectId);

    if (error) throw new Error(`[Supabase Error getCharacters]: ${error.message}`);
    return (data || []) as CharacterBible[];
  },

  async saveAndMergeCharacters(projectId: string, newCharacters: Omit<CharacterBible, 'id' | 'project_id' | 'version' | 'created_at' | 'updated_at'>[]): Promise<CharacterBible[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const existing = await this.getCharacters(projectId);
    const existingByName = new Map<string, CharacterBible>();
    for (const item of existing) existingByName.set(item.name.trim().toLowerCase(), item);

    const results: CharacterBible[] = [];
    for (const char of newCharacters) {
      const nameKey = char.name.trim().toLowerCase();
      const match = existingByName.get(nameKey);
      if (match) {
        const merged: CharacterBible = {
          ...match,
          ...char,
          updated_at: now,
        };
        results.push(merged);
      } else {
        const id = (char as any).id || (char as any)._id || `char_${projectId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const created: CharacterBible = {
          ...char,
          id,
          project_id: projectId,
          version: 1,
          clothing: char.clothing || [],
          accessories: char.accessories || [],
          created_at: now,
          updated_at: now,
        };
        results.push(created);
      }
    }

    if (results.length > 0) {
      const { error } = await supabase.from('characters').upsert(results.map(sanitizeForSupabase));
      if (error) throw new Error(`[Supabase Error saveAndMergeCharacters]: ${error.message}`);
    }

    return this.getCharacters(projectId);
  },

  // ---------------------------------------------------------------------------
  // LOCATIONS
  // ---------------------------------------------------------------------------
  async getLocations(projectId: string): Promise<LocationBible[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('locations').select('*').eq('project_id', projectId);
    if (error) throw new Error(`[Supabase Error getLocations]: ${error.message}`);
    return (data || []) as LocationBible[];
  },

  async saveAndMergeLocations(projectId: string, newLocations: Omit<LocationBible, 'id' | 'project_id' | 'version' | 'created_at' | 'updated_at'>[]): Promise<LocationBible[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const existing = await this.getLocations(projectId);
    const existingByName = new Map<string, LocationBible>();
    for (const item of existing) existingByName.set(item.name.trim().toLowerCase(), item);

    const results: LocationBible[] = [];
    for (const loc of newLocations) {
      const nameKey = loc.name.trim().toLowerCase();
      const match = existingByName.get(nameKey);
      if (match) {
        const merged: LocationBible = {
          ...match,
          ...loc,
          updated_at: now,
        };
        results.push(merged);
      } else {
        const id = (loc as any).id || (loc as any)._id || `loc_${projectId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const created: LocationBible = {
          ...loc,
          id,
          project_id: projectId,
          version: 1,
          color_palette: loc.color_palette || [],
          created_at: now,
          updated_at: now,
        };
        results.push(created);
      }
    }

    if (results.length > 0) {
      const { error } = await supabase.from('locations').upsert(results.map(sanitizeForSupabase));
      if (error) throw new Error(`[Supabase Error saveAndMergeLocations]: ${error.message}`);
    }

    return this.getLocations(projectId);
  },

  // ---------------------------------------------------------------------------
  // OBJECTS
  // ---------------------------------------------------------------------------
  async getObjects(projectId: string): Promise<ObjectBible[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('objects').select('*').eq('project_id', projectId);
    if (error) throw new Error(`[Supabase Error getObjects]: ${error.message}`);
    return (data || []) as ObjectBible[];
  },

  async saveAndMergeObjects(projectId: string, newObjects: Omit<ObjectBible, 'id' | 'project_id' | 'version' | 'created_at' | 'updated_at'>[]): Promise<ObjectBible[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const existing = await this.getObjects(projectId);
    const existingByName = new Map<string, ObjectBible>();
    for (const item of existing) existingByName.set(item.name.trim().toLowerCase(), item);

    const results: ObjectBible[] = [];
    for (const obj of newObjects) {
      const nameKey = obj.name.trim().toLowerCase();
      const match = existingByName.get(nameKey);
      if (match) {
        const merged: ObjectBible = {
          ...match,
          ...obj,
          updated_at: now,
        };
        results.push(merged);
      } else {
        const id = (obj as any).id || (obj as any)._id || `obj_${projectId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const created: ObjectBible = {
          ...obj,
          id,
          project_id: projectId,
          version: 1,
          created_at: now,
          updated_at: now,
        };
        results.push(created);
      }
    }

    if (results.length > 0) {
      const { error } = await supabase.from('objects').upsert(results.map(sanitizeForSupabase));
      if (error) throw new Error(`[Supabase Error saveAndMergeObjects]: ${error.message}`);
    }

    return this.getObjects(projectId);
  },

  // ---------------------------------------------------------------------------
  // SCENES
  // ---------------------------------------------------------------------------
  async getScenes(projectId: string): Promise<Scene[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_number', { ascending: true });

    if (error) throw new Error(`[Supabase Error getScenes]: ${error.message}`);
    return (data || []) as Scene[];
  },

  async getScene(sceneId: string): Promise<Scene | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('scenes').select('*').eq('id', sceneId).maybeSingle();
    if (error || !data) return null;
    return data as Scene;
  },

  async updateScene(sceneId: string, partial: Partial<Scene>): Promise<Scene | null> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      ...partial,
      updated_at: now,
    });

    const { error } = await supabase.from('scenes').update(cleanData).eq('id', sceneId);
    if (error) throw new Error(`[Supabase Error updateScene]: ${error.message}`);

    return this.getScene(sceneId);
  },

  async saveScenes(
    projectId: string,
    scenes: Omit<Scene, 'id' | 'project_id' | 'version' | 'created_at' | 'updated_at'>[]
  ): Promise<Scene[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const rows = scenes.map((s, idx) => {
      const id = (s as any).id || `scene_${projectId}_${s.scene_number || idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return sanitizeForSupabase({
        ...s,
        id,
        project_id: projectId,
        scene_tone: s.scene_tone || recommendSceneTone(s as Scene),
        version: 1,
        created_at: now,
        updated_at: now,
      });
    });

    const { error: rpcErr } = await supabase.rpc('replace_scenes', {
      p_project_id: projectId,
      p_scenes: rows,
    });

    if (rpcErr) {
      await supabase.from('scenes').delete().eq('project_id', projectId);
      if (rows.length > 0) {
        const { error } = await supabase.from('scenes').insert(rows);
        if (error) throw new Error(`[Supabase Error saveScenes]: ${error.message}`);
      }
    }

    return this.getScenes(projectId);
  },

  // ---------------------------------------------------------------------------
  // SHOTS
  // ---------------------------------------------------------------------------
  async getOrCreateVirtualShotForScene(sceneId: string): Promise<Shot> {
    const scene = await this.getScene(sceneId);
    if (!scene) throw new Error('Scene tidak ditemukan.');
    const shots = await this.getShotsByScene(sceneId);
    if (shots.length > 0) {
      return shots[0];
    }
    const newShot = sceneToVirtualShotAdapter(scene);
    const saved = await this.saveShots(sceneId, scene.project_id, [newShot]);
    return saved[0];
  },

  async getShot(shotId: string): Promise<Shot | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('shots').select('*').eq('id', shotId).maybeSingle();
    if (error || !data) return null;
    return data as Shot;
  },

  async getShotsByScene(sceneId: string): Promise<Shot[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('shots')
      .select('*')
      .eq('scene_id', sceneId)
      .order('shot_number', { ascending: true });

    if (error) throw new Error(`[Supabase Error getShotsByScene]: ${error.message}`);
    return (data || []) as Shot[];
  },

  async getShotsByProject(projectId: string): Promise<Shot[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('shots')
      .select('*')
      .eq('project_id', projectId)
      .order('shot_number', { ascending: true });

    if (error) throw new Error(`[Supabase Error getShotsByProject]: ${error.message}`);
    return (data || []) as Shot[];
  },

  async saveShots(
    sceneId: string,
    projectId: string,
    shots: Omit<Shot, 'id' | 'scene_id' | 'project_id' | 'version' | 'created_at' | 'updated_at'>[]
  ): Promise<Shot[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const rows = shots.map((s, idx) => {
      const id = (s as any).id || `shot_${sceneId}_${s.shot_number || idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return sanitizeForSupabase({
        ...s,
        id,
        scene_id: sceneId,
        project_id: projectId,
        version: 1,
        created_at: now,
        updated_at: now,
      });
    });

    const { error: rpcErr } = await supabase.rpc('replace_shots', {
      p_scene_id: sceneId,
      p_project_id: projectId,
      p_shots: rows,
    });

    if (rpcErr) {
      await supabase.from('shots').delete().eq('scene_id', sceneId);
      if (rows.length > 0) {
        const { error } = await supabase.from('shots').insert(rows);
        if (error) throw new Error(`[Supabase Error saveShots]: ${error.message}`);
      }
    }

    return this.getShotsByScene(sceneId);
  },

  async updateShot(shotId: string, partial: Partial<Shot>): Promise<Shot | null> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      ...partial,
      updated_at: now,
    });

    const { error } = await supabase.from('shots').update(cleanData).eq('id', shotId);
    if (error) throw new Error(`[Supabase Error updateShot]: ${error.message}`);

    return this.getShot(shotId);
  },

  // ---------------------------------------------------------------------------
  // VIDEO PROMPTS
  // ---------------------------------------------------------------------------
  async getVideoPromptsByShot(shotId: string): Promise<VideoPrompt[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('video_prompts').select('*').eq('shot_id', shotId);
    if (error) throw new Error(`[Supabase Error getVideoPromptsByShot]: ${error.message}`);
    return (data || []) as VideoPrompt[];
  },

  async getVideoPromptsByScene(sceneId: string): Promise<VideoPrompt[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('video_prompts').select('*').eq('scene_id', sceneId);
    if (error) throw new Error(`[Supabase Error getVideoPromptsByScene]: ${error.message}`);
    return (data || []) as VideoPrompt[];
  },

  async getVideoPromptsByProject(projectId: string): Promise<VideoPrompt[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('video_prompts').select('*').eq('project_id', projectId);
    if (error) throw new Error(`[Supabase Error getVideoPromptsByProject]: ${error.message}`);
    return (data || []) as VideoPrompt[];
  },

  async saveVideoPrompts(
    shotId: string,
    sceneId: string,
    projectId: string,
    prompts: Omit<VideoPrompt, 'id' | 'shot_id' | 'scene_id' | 'project_id' | 'version' | 'created_at' | 'updated_at'>[]
  ): Promise<VideoPrompt[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    const rows = prompts.map((p, idx) => {
      const id = (p as any).id || `vprompt_${shotId}_${p.target_platform || 'plat'}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return sanitizeForSupabase({
        ...p,
        id,
        shot_id: shotId,
        scene_id: sceneId,
        project_id: projectId,
        version: 1,
        created_at: now,
        updated_at: now,
      });
    });

    const { error: rpcErr } = await supabase.rpc('replace_video_prompts', {
      p_shot_id: shotId,
      p_scene_id: sceneId,
      p_project_id: projectId,
      p_prompts: rows,
    });

    if (rpcErr) {
      await supabase.from('video_prompts').delete().eq('shot_id', shotId);
      if (rows.length > 0) {
        const { error } = await supabase.from('video_prompts').insert(rows);
        if (error) throw new Error(`[Supabase Error saveVideoPrompts]: ${error.message}`);
      }
    }

    return this.getVideoPromptsByShot(shotId);
  },

  async saveSingleVideoPrompt(prompt: VideoPrompt): Promise<VideoPrompt> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const targetSlug = prompt.prompt_target || prompt.target_platform;
    const id = prompt.id || `vprompt_${prompt.shot_id}_${targetSlug}_${Date.now()}`;
    const full: VideoPrompt = { ...prompt, id, updated_at: now };

    const { error } = await supabase.from('video_prompts').upsert(sanitizeForSupabase(full));
    if (error) throw new Error(`[Supabase Error saveSingleVideoPrompt]: ${error.message}`);
    return full;
  },

  // ---------------------------------------------------------------------------
  // PIPELINE LOGS & TELEMETRY
  // ---------------------------------------------------------------------------
  async addLog(projectId: string, log: Omit<PipelineLogEvent, 'timestamp'>): Promise<PipelineLogEvent> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const fullLog: PipelineLogEvent = { ...log, timestamp: now };

    const cleanData = sanitizeForSupabase({
      project_id: projectId,
      stage: log.stage,
      stage_name: log.stage_name,
      stage_code: log.stage_code,
      scope: log.scope,
      level: log.level,
      message: log.message,
      duration_ms: log.duration_ms,
      error_type: log.error_type,
      run_id: log.run_id,
      timestamp: now,
    });

    const { error } = await supabase.from('pipeline_logs').insert(cleanData);
    if (error) throw new Error(`[Supabase Error addLog]: ${error.message}`);
    return fullLog;
  },

  async getLogs(projectId: string): Promise<PipelineLogEvent[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pipeline_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: true });

    if (error) throw new Error(`[Supabase Error getLogs]: ${error.message}`);
    return (data || []).map(r => ({
      stage: r.stage,
      stage_name: r.stage_name,
      stage_code: r.stage_code,
      scope: r.scope,
      level: r.level,
      message: r.message,
      duration_ms: r.duration_ms,
      error_type: r.error_type,
      run_id: r.run_id,
      timestamp: r.timestamp,
    }));
  },

  async addTelemetry(projectId: string, item: StageExecutionTelemetry): Promise<StageExecutionTelemetry> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      id: item.id || `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      project_id: projectId,
      run_id: item.run_id,
      scene_id: item.scene_id,
      shot_id: item.shot_id,
      stage: item.stage,
      stage_code: item.stage_code,
      scope: item.scope,
      attempt: item.attempt,
      started_at: item.started_at,
      completed_at: item.completed_at,
      duration_ms: item.duration_ms,
      status: item.status,
      error_type: item.error_type,
      error_message: item.error_message,
      summary_type: item.summary_type,
      summary: item.summary,
      created_at: now,
    });

    const { error } = await supabase.from('stage_telemetry').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error addTelemetry]: ${error.message}`);
    return item;
  },

  async getTelemetry(projectId: string): Promise<StageExecutionTelemetry[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('stage_telemetry')
      .select('*')
      .eq('project_id', projectId)
      .order('started_at', { ascending: true });

    if (error) throw new Error(`[Supabase Error getTelemetry]: ${error.message}`);
    return (data || []).map(r => ({
      id: r.id,
      project_id: r.project_id,
      run_id: r.run_id,
      scene_id: r.scene_id,
      shot_id: r.shot_id,
      stage: r.stage,
      stage_code: r.stage_code,
      scope: r.scope,
      attempt: r.attempt,
      started_at: r.started_at,
      completed_at: r.completed_at,
      duration_ms: r.duration_ms,
      status: r.status,
      error_type: r.error_type,
      error_message: r.error_message,
      summary_type: r.summary_type,
      summary: r.summary,
    }));
  },

  // ---------------------------------------------------------------------------
  // STORY ARCHITECTURE
  // ---------------------------------------------------------------------------
  async getStoryArchitecture(projectId: string): Promise<StoryArchitecture | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('story_architectures').select('*').eq('project_id', projectId).maybeSingle();
    if (error || !data) return null;
    return data as StoryArchitecture;
  },

  async saveStoryArchitecture(arch: StoryArchitecture): Promise<StoryArchitecture> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      ...arch,
      project_id: arch.project_id,
      updated_at: now,
    });

    const { error } = await supabase.from('story_architectures').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveStoryArchitecture]: ${error.message}`);
    return arch;
  },

  // ---------------------------------------------------------------------------
  // CONTINUITY STATES & SNAPSHOTS
  // ---------------------------------------------------------------------------
  async getCharacterContinuityStates(projectId: string): Promise<CharacterContinuityState[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('continuity_states').select('*').eq('project_id', projectId).maybeSingle();
    if (error || !data) return [];
    return (data.states || []) as CharacterContinuityState[];
  },

  async saveCharacterContinuityStates(projectId: string, states: CharacterContinuityState[]): Promise<CharacterContinuityState[]> {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      project_id: projectId,
      states,
      updated_at: now,
    });

    const { error } = await supabase.from('continuity_states').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveCharacterContinuityStates]: ${error.message}`);
    return states;
  },

  async recordApprovedCostumeTransition(projectId: string, transition: ApprovedCostumeTransition): Promise<CharacterContinuityState[]> {
    const states = await this.getCharacterContinuityStates(projectId);
    if (states.length > 0) {
      const state = states[0];
      state.approved_transitions = state.approved_transitions || [];
      state.approved_transitions.push(transition);
    }
    await this.saveCharacterContinuityStates(projectId, states);
    return states;
  },

  async getContinuitySnapshot(projectId: string, sceneNumber: number): Promise<ContinuitySnapshot | null> {
    const supabase = getSupabaseClient();
    const id = `${projectId}_scene_${sceneNumber}`;
    const { data, error } = await supabase.from('continuity_snapshots').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return data.snapshot_data as ContinuitySnapshot;
  },

  async saveContinuitySnapshot(projectId: string, sceneNumber: number, snapshot: ContinuitySnapshot): Promise<ContinuitySnapshot> {
    const supabase = getSupabaseClient();
    const id = `${projectId}_scene_${sceneNumber}`;
    const now = new Date().toISOString();
    const cleanData = sanitizeForSupabase({
      id,
      project_id: projectId,
      scene_number: sceneNumber,
      snapshot_data: snapshot,
      created_at: now,
    });

    const { error } = await supabase.from('continuity_snapshots').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveContinuitySnapshot]: ${error.message}`);
    return snapshot;
  },

  // ---------------------------------------------------------------------------
  // AI INFRASTRUCTURE DOMAIN
  // ---------------------------------------------------------------------------
  async getProviders(): Promise<AIProvider[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_providers').select('*');
    if (error) throw new Error(`[Supabase Error getProviders]: ${error.message}`);
    return (data || []) as AIProvider[];
  },

  async getProvider(id: string): Promise<AIProvider | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_providers').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return data as AIProvider;
  },

  async saveProvider(provider: AIProvider): Promise<AIProvider> {
    const supabase = getSupabaseClient();
    const cleanData = sanitizeForSupabase(provider);
    const { error } = await supabase.from('ai_providers').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveProvider]: ${error.message}`);
    return provider;
  },

  async deleteProvider(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('ai_providers').delete().eq('id', id);
    if (error) throw new Error(`[Supabase Error deleteProvider]: ${error.message}`);
    return true;
  },

  async getCredentials(): Promise<AICredential[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_credentials').select('*');
    if (error) throw new Error(`[Supabase Error getCredentials]: ${error.message}`);
    return (data || []).map(r => ({
      ...r,
      providerId: r.provider_id,
      maskedKey: r.masked_key,
      encryptedSecret: r.encrypted_secret,
      googleMetadata: r.google_metadata,
      lastUsedAt: r.last_used_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) as AICredential[];
  },

  async getCredential(id: string): Promise<AICredential | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_credentials').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      providerId: data.provider_id,
      maskedKey: data.masked_key,
      encryptedSecret: data.encrypted_secret,
      googleMetadata: data.google_metadata,
      lastUsedAt: data.last_used_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } as AICredential;
  },

  async saveCredential(cred: AICredential): Promise<AICredential> {
    const supabase = getSupabaseClient();
    const cleanData = sanitizeForSupabase({
      id: cred.id,
      provider_id: cred.providerId,
      name: cred.name,
      masked_key: cred.maskedKey,
      encrypted_secret: cred.encryptedSecret,
      google_metadata: cred.googleMetadata,
      status: cred.status,
      priority: cred.priority,
      weight: cred.weight,
      last_used_at: cred.lastUsedAt,
      created_at: cred.createdAt,
      updated_at: cred.updatedAt,
    });

    const { error } = await supabase.from('ai_credentials').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveCredential]: ${error.message}`);
    return cred;
  },

  async deleteCredential(id: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('ai_credentials').delete().eq('id', id);
    if (error) throw new Error(`[Supabase Error deleteCredential]: ${error.message}`);
    return true;
  },

  async getModels(): Promise<AIModel[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_models').select('*');
    if (error) throw new Error(`[Supabase Error getModels]: ${error.message}`);
    return (data || []).map(r => ({
      ...r,
      providerId: r.provider_id,
      displayName: r.display_name,
      contextWindow: r.context_window,
      createdAt: r.created_at,
    })) as AIModel[];
  },

  async getModel(id: string, providerId?: string): Promise<AIModel | null> {
    const supabase = getSupabaseClient();
    let query = supabase.from('ai_models').select('*').eq('id', id);
    if (providerId) {
      query = query.eq('provider_id', providerId);
    }
    const { data, error } = await query.limit(1).maybeSingle();
    if (error || !data) return null;
    return {
      ...data,
      providerId: data.provider_id,
      displayName: data.display_name,
      contextWindow: data.context_window,
      createdAt: data.created_at,
    } as AIModel;
  },

  async saveModel(model: AIModel): Promise<AIModel> {
    const supabase = getSupabaseClient();
    const cleanData = sanitizeForSupabase({
      id: model.id,
      provider_id: model.providerId || 'google',
      display_name: model.displayName,
      tier: model.tier,
      capabilities: model.capabilities,
      enabled: model.enabled,
      context_window: model.contextWindow,
      created_at: model.createdAt,
    });

    const { error } = await supabase.from('ai_models').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveModel]: ${error.message}`);
    return model;
  },

  async deleteModel(id: string, providerId?: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    let query = supabase.from('ai_models').delete().eq('id', id);
    if (providerId) {
      query = query.eq('provider_id', providerId);
    }
    const { error } = await query;
    if (error) throw new Error(`[Supabase Error deleteModel]: ${error.message}`);
    return true;
  },

  async getUsages(limitCount: number = 100): Promise<AIUsage[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('ai_usage')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limitCount);

    if (error) throw new Error(`[Supabase Error getUsages]: ${error.message}`);
    return (data || []).map(r => ({
      ...r,
      credentialId: r.credential_id,
      modelId: r.model_id,
      requestType: r.request_type,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      latencyMs: r.latency_ms,
      errorType: r.error_type,
    })) as AIUsage[];
  },

  async saveUsage(usage: AIUsage): Promise<AIUsage> {
    const supabase = getSupabaseClient();
    const cleanData = sanitizeForSupabase({
      id: usage.id,
      credential_id: usage.credentialId,
      model_id: usage.modelId,
      request_type: usage.requestType,
      stage: usage.stage,
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      latency_ms: usage.latencyMs,
      success: usage.success,
      error_type: usage.errorType,
      timestamp: usage.timestamp,
    });

    const { error } = await supabase.from('ai_usage').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveUsage]: ${error.message}`);
    return usage;
  },

  async clearUsages(): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('ai_usage').delete().gte('timestamp', 0);
    if (error) throw new Error(`[Supabase Error clearUsages]: ${error.message}`);
    return true;
  },

  async getHealth(credentialId: string): Promise<AIHealth | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_health').select('*').eq('credential_id', credentialId).maybeSingle();
    if (error || !data) return null;
    return {
      credentialId: data.credential_id,
      status: data.status,
      consecutiveFailures: data.consecutive_failures,
      successRate: data.success_rate,
      cooldownUntil: data.cooldown_until,
      lastError: data.last_error,
      updatedAt: data.updated_at,
    } as AIHealth;
  },

  async saveHealth(health: AIHealth): Promise<AIHealth> {
    const supabase = getSupabaseClient();
    const cleanData = sanitizeForSupabase({
      credential_id: health.credentialId,
      status: health.status,
      consecutive_failures: health.consecutiveFailures,
      success_rate: health.successRate,
      cooldown_until: health.cooldownUntil,
      last_error: health.lastError,
      updated_at: health.updatedAt,
    });

    const { error } = await supabase.from('ai_health').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveHealth]: ${error.message}`);
    return health;
  },

  async getRoutingPolicies(): Promise<AIRoutingPolicy[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('ai_routing_policies').select('*');
    if (error) throw new Error(`[Supabase Error getRoutingPolicies]: ${error.message}`);
    return (data || []).map(r => ({
      id: r.id,
      taskType: r.task_type,
      preferredModelIds: r.preferred_model_ids,
      fallbackModelIds: r.fallback_model_ids,
      strategy: r.strategy,
      enabled: r.enabled,
      createdAt: r.created_at,
    })) as AIRoutingPolicy[];
  },

  async saveRoutingPolicy(policy: AIRoutingPolicy): Promise<AIRoutingPolicy> {
    const supabase = getSupabaseClient();
    const cleanData = sanitizeForSupabase({
      id: policy.id,
      task_type: policy.taskType,
      preferred_model_ids: policy.preferredModelIds,
      fallback_model_ids: policy.fallbackModelIds,
      strategy: policy.strategy,
      enabled: policy.enabled,
      created_at: policy.createdAt,
    });

    const { error } = await supabase.from('ai_routing_policies').upsert(cleanData);
    if (error) throw new Error(`[Supabase Error saveRoutingPolicy]: ${error.message}`);
    return policy;
  },
};
