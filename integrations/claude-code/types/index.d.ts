declare module 'claude-code' {
  interface PluginState {
    checkyourprocess: { band: {
      snapshot: any; locale: 'ko' | 'en'; scope: 'session' | 'project'; details: boolean;
      connected: boolean; lastHostSessionId: string;
      page: number; view: 'tasks' | 'projects'; projects: { id: string; name: string }[]; projectPage: number;
    } }
  }
}
