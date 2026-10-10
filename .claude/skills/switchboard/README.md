# switchboard

A Claude Code mod (function hooks plugin). Claude Code auto-loads it from `.claude/skills/switchboard` in any session started in this repo.

- **Agent to agent comms**: messages from other sessions, teammates and agents are kept in an inbox (last 50) with a toast. `/inbox` opens them in a pane; `/send <to> <message>` sends one by the name `ListAgents` shows.
- **UI**: a band above the prompt shows the current route (`deep → claude-opus-5-5`) and a button for unread messages; the status line shows the tier.
- **Model selection triage**: each typed prompt is classified, by the local laya-mlx MCP server (`laya`, from `.mcp.json`, ~10ms, free) when it is connected and confident (margin 0.1 or more), else by Haiku, as quick, standard, deep, ultra or copywriting, and that turn's main-loop requests go to Haiku 5.5 (low effort), Opus (medium or high effort), Fable 5.1 (max for ultra, medium for copywriting). Every route has a 1M context window, so a quick turn late in a long conversation never overflows a smaller model and forces a compaction (Haiku 4.5, the old quick route, had 200K; Haiku 5.5 has 1M). `/triage on|off`, `/triage quick|standard|deep|ultra|copywriting` to pin the main loop, `/triage auto` to unpin.
- **Subagents and workflows**: an Agent tool subagent of type `general-purpose` with no model given is routed by its task at spawn. Workflow agents (ultracode included) never pass `agent.spawn`, so their opening task is captured at `session.append` and they are routed on their first request. A model chosen explicitly (`Agent({ model })`, `agent(..., { model })`, a custom agent type's own model), a fork and a teammate are left alone. The band and `/triage` show how many subagents went to each tier.

Switching models between turns drops the prompt cache, so pin a tier for long sessions where that cost matters. Routes live in `ROUTES` in `hooks/register.tsx`.

Check it with `claude plugin validate .claude/skills/switchboard` and `claude plugin test .claude/skills/switchboard`.
