export type Host = 'claude-code' | 'codex' | 'claude-desktop' | 'chatgpt';
export type Locale = 'ko' | 'en';
export type Scope = 'session' | 'project';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type Activity = 'idle' | 'running' | 'waiting' | 'interrupted' | 'error';
export interface Project { id: string; name: string; createdAt: string }
export interface TrackingSession {
  id: string; host: Host; title: string; projectId: string | null;
  activity: Activity; activitySource: 'hook' | 'reported'; currentTaskId: string | null;
  lastAgentEventAt: string | null; createdAt: string; endedAt: string | null;
  hostSessionBound?: boolean;
  /** Sub-agents currently known to be running (SubagentStart seen, SubagentStop not yet). */
  activeAgents?: number;
}
export interface Task {
  id: string; projectId: string | null; title: string; status: TaskStatus;
  revision: number; sessionIds: string[]; updatedAt: string;
}
export interface Settings { locale: Locale }
export interface Snapshot {
  trackingSessionId: string; scope: Scope; project: Project | null;
  session: TrackingSession; sessions: TrackingSession[]; tasks: Task[];
  progress: { completed: number; total: number; percent: number | null };
  settings: Settings; snapshotAt: string;
}
export interface Catalog {
  projects: Project[]; sessions: TrackingSession[]; settings: Settings;
}
export const ACTIONS = [
  'start_tracking', 'resume_tracking', 'create_project', 'connect_project',
  'register_tasks', 'link_tasks', 'update_task', 'report_state',
  'end_tracking', 'get_snapshot', 'get_catalog', 'save_settings',
] as const;
export type Action = typeof ACTIONS[number];
