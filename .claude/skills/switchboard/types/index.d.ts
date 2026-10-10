export type SwitchboardTier = 'quick' | 'standard' | 'deep' | 'ultra' | 'copywriting';
export type SwitchboardMessage = { from: string; text: string; at: number };

declare module 'claude-code' {
  interface PluginState {
    switchboard: {
      isTriageOn: boolean;
      pinned: SwitchboardTier | null;
      tier: SwitchboardTier | null;
      inbox: SwitchboardMessage[];
      unread: number;
      subagents: Record<SwitchboardTier, number>;
      agentTiers: Record<string, SwitchboardTier | null>;
      sessionModel: string | null;
    };
  }
}
