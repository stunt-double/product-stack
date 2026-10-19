export type SwitchboardTier = 'quick' | 'standard' | 'deep' | 'ultra' | 'copywriting';
// A subagent route: a model tier, or a handover to Codex's agent.
export type SwitchboardRoute = SwitchboardTier | 'codex';
export type SwitchboardMessage = { from: string; text: string; at: number };

declare module 'claude-code' {
  interface PluginState {
    switchboard: {
      isTriageOn: boolean;
      isCodexOn: boolean;
      pinned: SwitchboardTier | null;
      tier: SwitchboardTier | null;
      inbox: SwitchboardMessage[];
      unread: number;
      subagents: Record<SwitchboardRoute, number>;
      agentTiers: Record<string, SwitchboardTier | null>;
      sessionModel: string | null;
    };
  }
}
