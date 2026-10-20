export type SwitchboardTier = 'quick' | 'standard' | 'deep' | 'ultra' | 'copywriting';
// A subagent route: a model tier, or a handover to Codex's agent.
export type SwitchboardRoute = SwitchboardTier | 'codex';
export type SwitchboardMessage = { from: string; text: string; at: number };
// One agent loop of this session as the switchboard pane draws it; `parentId` absent under main.
export type SwitchboardAgent = {
  id: string;
  parentId?: string;
  description: string;
  type: string;
  route: SwitchboardRoute | null;
  model: string;
  status: 'running' | 'idle' | 'completed' | 'failed' | 'killed';
  at: number;
};
// One message on the wire: `main`, an agent's id, or a peer's name at either end.
export type SwitchboardWire = { from: string; to: string; text: string; at: number };

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
      agents: SwitchboardAgent[];
      wire: SwitchboardWire[];
    };
  }
}
