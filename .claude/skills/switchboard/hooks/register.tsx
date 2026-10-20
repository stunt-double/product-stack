import type { EngineInterface, Register } from 'claude-code';
import { atom, read, update } from 'claude-code';

import { choice, type Fetch, TypeSafeClient } from './vendor/typesafe-sdk.mjs';
import type { SwitchboardMessage, SwitchboardRoute, SwitchboardTier } from '../types';

const isTriageOn = atom({ plugin: 'switchboard', key: 'isTriageOn' } as const, true);
const isCodexOn = atom({ plugin: 'switchboard', key: 'isCodexOn' } as const, true);
const pinned = atom({ plugin: 'switchboard', key: 'pinned' } as const, null);
const tier = atom({ plugin: 'switchboard', key: 'tier' } as const, null);
const inbox = atom({ plugin: 'switchboard', key: 'inbox' } as const, []);
const unread = atom({ plugin: 'switchboard', key: 'unread' } as const, 0);
const subagents = atom({ plugin: 'switchboard', key: 'subagents' } as const, {
  quick: 0,
  standard: 0,
  deep: 0,
  ultra: 0,
  copywriting: 0,
  codex: 0,
});
// ponytail: one entry per workflow agent for the session; fine at workflow scale.
const agentTiers = atom({ plugin: 'switchboard', key: 'agentTiers' } as const, {});

const INBOX = 'switchboard-inbox';
const TIERS: readonly SwitchboardTier[] = ['quick', 'standard', 'deep', 'ultra', 'copywriting'];

// Cheapest model that does the job; Opus kept for hard reasoning. Every route has a 1M window:
// a turn routed to a 200K model (Haiku 4.5) overflows a long conversation and forces compaction.
export const ROUTES: Record<SwitchboardTier, { model: string; effort: 'low' | 'medium' | 'high' | 'max' }> = {
  quick: { model: 'claude-haiku-5-5', effort: 'low' },
  standard: { model: 'claude-opus-5-5', effort: 'medium' },
  deep: { model: 'claude-opus-5-5', effort: 'high' },
  ultra: { model: 'claude-fable-5-1', effort: 'max' },
  copywriting: { model: 'claude-fable-5-1', effort: 'medium' },
};

const HINTS: Record<SwitchboardTier, string> = {
  quick: 'a lookup, a one-line answer, a rename or a tiny edit',
  standard: 'an ordinary coding task in a few files',
  deep: 'architecture, debugging, a migration, multi-step or risky work',
  ultra: 'full-system redesign, highest-complexity multi-step work, maximum reasoning needed',
  copywriting: 'marketing copy, product writing, messaging, tone and voice',
};

// A generic subagent may instead be handed over to Codex (the openai-codex plugin's agent).
export const CODEX_AGENT = 'codex:codex-rescue';
const SPAWN_HINTS: Record<SwitchboardRoute, string> = {
  ...HINTS,
  codex:
    'hand over to Codex: a large self-contained implementation, a second opinion on a risky design, or a bug whose cause is still unclear',
};
const ROUTE_NAMES: readonly SwitchboardRoute[] = [...TIERS, 'codex'];

// TypeSafe's Jev decides first when a key is set; below this Choice confidence it is unsure.
// ponytail: 0.3 is a starting point (a 5-way choice's peak near 0.45); tune on real prompts.
const JEV_MODEL = 'jev-latest';
const JEV_MIN_CONFIDENCE = 0.3;

const choiceOf = <T extends string>(options: Record<T, string>, label: string | undefined): T | null =>
  (Object.keys(options) as T[]).find((k) => label?.startsWith(k)) ?? null;

export const tierOf = (label: string | undefined): SwitchboardTier | null => choiceOf(HINTS, label);

// Agent types whose model nobody chose: a custom agent's own `model` is respected.
const TRIAGED_TYPES = new Set(['general-purpose']);

// An engine fork (compaction, memory) opens on the whole transcript; a workflow agent on its task.
const MAX_OPENING_MESSAGES = 3;

const INJECTED_DOORS = new Set([
  'attachment',
  'hook-context',
  'note',
  'delivery',
  'compaction',
  'notice',
]);

const PEER_KINDS = new Set(['peer', 'coordinator', 'peer-send-message']);

// A person's own prompt: typed at the terminal, sent from the Claude app (Remote Control), or `claude -p` / the Agent SDK.
const PERSON_KINDS = new Set(['composer', 'bridge', 'sdk']);

// The key from `claude plugin configure switchboard`, else TYPESAFE_API_KEY; set by register.
let configuredKey: string | undefined;

async function typesafeKey($: EngineInterface): Promise<string | undefined> {
  return configuredKey || (await $.env.get('TYPESAFE_API_KEY').catch(() => undefined)) || undefined;
}

// The SDK's fetch over the host's: the module has no fetch or Response of its own. The body is
// read whole, so `body` is null and the SDK skips its streaming buffer.
const hostFetch =
  ($: EngineInterface): Fetch =>
  async (url, init) => {
    const res = await $.http.fetch(url, {
      method: init?.method,
      headers: init?.headers as Record<string, string> | undefined,
      body: init?.body as string | undefined,
    });
    const response = {
      ok: res.ok,
      status: res.status,
      headers: { get: (name: string) => res.headers[name.toLowerCase()] ?? null },
      body: null,
      text: async () => res.text,
      json: async () => JSON.parse(res.text),
      clone: () => response,
    };
    return response as unknown as Awaited<ReturnType<Fetch>>;
  };

// Jev first (fast, typed, calibrated); Haiku when no key is set, the call fails or Jev is unsure.
async function jevChoice<T extends string>(
  $: EngineInterface,
  text: string,
  options: Record<T, string>
): Promise<T | null> {
  const apiKey = await typesafeKey($);
  if (apiKey === undefined) return null;
  try {
    // No retries and a short timeout: a prompt waits on this, and Haiku is the fallback.
    const client = new TypeSafeClient({
      apiKey,
      fetch: hostFetch($),
      compression: false,
      timeout: 5000,
      retry: { maxRetries: 0 },
    });
    const { answers } = await client.systemOne({
      model: JEV_MODEL,
      state: { request: text.slice(0, 8000) },
      questions: {
        route: choice('Which option best describes the work the coding assistant must do for `request`?', options),
      },
    });
    const { choice: picked, confidence } = answers.route;
    return (confidence ?? 0) >= JEV_MIN_CONFIDENCE ? choiceOf(options, picked) : null;
  } catch {
    return null;
  }
}

async function classify($: EngineInterface, text: string): Promise<SwitchboardTier | null>;
async function classify<T extends string>(
  $: EngineInterface,
  text: string,
  options: Record<T, string>
): Promise<T | null>;
async function classify($: EngineInterface, text: string, options: Record<string, string> = HINTS) {
  const labels = Object.entries(options).map(([k, hint]) => `${k}: ${hint}`);
  return (
    (await jevChoice($, text, options)) ??
    $.model
      .classify(text.slice(0, 4000), labels, { model: 'haiku' })
      .then((label) => choiceOf(options, label))
      .catch(() => null)
  );
}

async function count($: EngineInterface, picked: SwitchboardRoute) {
  // A tally kept from before a route existed lacks its key.
  await update($, subagents, (n) => ({ ...n, [picked]: (n[picked] ?? 0) + 1 }));
}

const tallyOf = (routed: Partial<Record<SwitchboardRoute, number>>) =>
  ROUTE_NAMES.filter((t) => (routed[t] ?? 0) > 0).map((t) => `${routed[t]} ${t}`);

// The session's own model, read off the main loop before triage rewrites it; kept across reloads.
const sessionModel = atom({ plugin: 'switchboard', key: 'sessionModel' } as const, null);
// A subagent's opening task, captured at session.append until its first request.
const openings = new Map<string, string>();
// In-flight decisions, so concurrent steps of one agent classify once.
const deciding = new Map<string, Promise<SwitchboardTier | null>>();

type FirstStep = { agentId: string; model: string; index: number; messageCount: number };

// Workflow agents never pass agent.spawn, so they are routed on their first request.
async function decideWorkflowAgent(
  $: EngineInterface,
  step: FirstStep
): Promise<SwitchboardTier | null> {
  const known = (await read($, agentTiers))[step.agentId];
  if (known !== undefined) return known;

  const task = openings.get(step.agentId) ?? '';
  openings.delete(step.agentId);
  // No opening seen (a reload in between, an engine loop): leave it, and decide nothing for good.
  if (task === '') return null;
  const inherited = await read($, sessionModel);

  const isWorkflowAgent =
    step.index === 0 &&
    step.messageCount <= MAX_OPENING_MESSAGES &&
    // A model other than the session's was chosen explicitly (`agent(..., { model })`).
    step.model === inherited &&
    // Listed agents came through agent.spawn, which already decided.
    !(await $.agent.list()).some((a) => a.id === step.agentId);

  let picked: SwitchboardTier | null = null;
  if (isWorkflowAgent && (await read($, isTriageOn))) {
    picked = await classify($, task);
    if (picked !== null) await count($, picked);
  }
  await update($, agentTiers, (all) => ({ ...all, [step.agentId]: picked }));
  return picked;
}

export const register: Register = (on, options) => {
  configuredKey = typeof options.typesafe_api_key === 'string' ? options.typesafe_api_key : undefined;

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'triage',
      description: 'Model triage: on, off, auto, pin a tier, or codex on|off for subagent handover',
      argumentHint: '[on|off|auto|quick|standard|deep|ultra|copywriting|codex on|codex off]',
    });
    await $.command.register({
      name: 'inbox',
      description: 'Show messages from other sessions and agents',
    });
    await $.command.register({
      name: 'send',
      description: 'Send a message to another session or agent',
      argumentHint: '<to> <message>',
    });

    return next(e);
  });

  // Model selection triage: classify each typed prompt, then route the turn's requests.
  on('prompt.submit', async ($, e, next) => {
    if (!PERSON_KINDS.has(e.origin.kind) || e.text.startsWith('/')) return next(e);

    const pin = await read($, pinned);
    let picked: SwitchboardTier | null = pin;
    if (pin === null && (await read($, isTriageOn))) {
      picked = await classify($, e.text);
    }
    await update($, tier, () => picked);
    $.ui.status(picked ? `triage: ${picked}` : undefined);

    return next(e);
  });

  // Agent tool subagents: route a generic subagent nobody picked a model for, or hand it to Codex.
  on('agent.spawn', async ($, e, next) => {
    if (
      e.fork ||
      e.isTeammate ||
      e.model !== undefined ||
      !TRIAGED_TYPES.has(e.subagentType) ||
      !(await read($, isTriageOn))
    )
      return next(e);

    const task = `${e.description}\n\n${e.prompt}`;
    const picked = (await read($, isCodexOn)) ? await classify($, task, SPAWN_HINTS) : await classify($, task);
    if (picked === null) return next(e);

    if (picked === 'codex') {
      // Codex's agent keeps its own model; the Agent prompt is already self-contained.
      const handed = await next({ ...e, subagentType: CODEX_AGENT });
      if (handed.deny === undefined) {
        await count($, 'codex');
        return handed;
      }
      // The codex plugin is not installed or refused: the work is substantial, so route it deep.
      await count($, 'deep');
      return next({ ...e, model: ROUTES.deep.model });
    }

    await count($, picked);
    return next({ ...e, model: ROUTES[picked].model });
  });

  // Keep the agent's own task: its first user row as typed, not what the engine or a hook injects.
  on('session.append', ($, e, next) => {
    const id = e.agentId;
    if (
      id !== undefined &&
      e.message.role === 'user' &&
      !e.message.isMeta &&
      !INJECTED_DOORS.has(e.door) &&
      !openings.has(id) &&
      !deciding.has(id)
    ) {
      const text = e.message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n');
      if (text) openings.set(id, text.slice(0, 8000));
    }
    return next(e);
  });

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      if ((await read($, sessionModel)) !== e.model) await update($, sessionModel, () => e.model);
      const picked = await read($, tier);
      if (picked === null) return yield* next(e);

      const { model, effort } = ROUTES[picked];
      return yield* next({ ...e, model, effort });
    }

    const agentId = e.agentId;
    let decision = deciding.get(agentId);
    if (decision === undefined) {
      decision = decideWorkflowAgent($, {
        agentId,
        model: e.model,
        index: e.index,
        messageCount: e.messageCount,
      });
      deciding.set(agentId, decision);
    }
    const picked = await decision;
    if (picked === null) return yield* next(e);

    // A subagent keeps the effort it was given.
    return yield* next({ ...e, model: ROUTES[picked].model });
  });

  // Agent to agent comms: keep an inbox of peer deliveries, and send with /send.
  on('session.receive', async ($, e, next) => {
    if (PEER_KINDS.has(e.origin.kind)) {
      const from = 'teammate' in e.origin ? e.origin.teammate : e.origin.kind;
      const message: SwitchboardMessage = {
        from,
        text: e.text,
        at: await $.clock.now(),
      };
      await update($, inbox, (list) => [...list, message].slice(-50));
      await update($, unread, (n) => n + 1);
      $.ui.toast(`Message from ${from}`);
    }

    return next(e);
  });

  on('command.run', { command: 'send' }, async ($, e) => {
    const [to, ...words] = e.args.trim().split(/\s+/);
    const text = words.join(' ');
    if (!to || !text)
      return {
        text: 'Usage: /send <to> <message> (names as ListAgents lists them)',
      };

    const sent = await $.session.send({ to, text });
    return {
      text: sent.isDelivered ? `Sent to ${to}.` : `Not sent: ${sent.reason}`,
    };
  });

  on('command.run', { command: 'inbox' }, async ($) => {
    await update($, unread, () => 0);
    await $.ui.open({ id: INBOX, title: 'Inbox' });
    return { text: 'Inbox opened.' };
  });

  on('command.run', { command: 'triage' }, async ($, e) => {
    const arg = e.args.trim().replace(/\s+/g, ' ');
    if (arg === 'codex on' || arg === 'codex off') await update($, isCodexOn, () => arg === 'codex on');
    else if (arg === 'on' || arg === 'off') await update($, isTriageOn, () => arg === 'on');
    else if (arg === 'auto') await update($, pinned, () => null);
    else if ((TIERS as readonly string[]).includes(arg))
      await update($, pinned, () => arg as SwitchboardTier);
    else if (arg !== '')
      return { text: 'Usage: /triage [on|off|auto|quick|standard|deep|ultra|copywriting|codex on|codex off]' };

    if (!(await read($, isTriageOn)) && (await read($, pinned)) === null) {
      await update($, tier, () => null);
      $.ui.status(undefined);
    }
    const pin = await read($, pinned);
    const tally = tallyOf(await read($, subagents));
    const codex = (await read($, isCodexOn)) ? '' : ' Codex handover off.';
    const decider = (await typesafeKey($))
      ? ` Decided by ${JEV_MODEL}, Haiku when unsure.`
      : ' Decided by Haiku: set TYPESAFE_API_KEY or run `claude plugin configure switchboard` to decide with Jev.';
    return {
      text: `Triage ${(await read($, isTriageOn)) ? 'on' : 'off'}${pin ? `, pinned to ${pin} (${ROUTES[pin].model})` : ''}.${decider}${codex}${tally.length ? ` Subagents routed: ${tally.join(', ')}.` : ''}`,
    };
  });

  // UI: a band above the prompt with the route and unread messages.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const picked = await read($, tier);
    const count = await read($, unread);
    const tally = tallyOf(await read($, subagents));
    if (e.props.hasSurvey || (picked === null && count === 0 && tally.length === 0)) return next(e);

    const { Box, Button, Text } = $.ui.resolve(e);
    return (
      <Box gap={2}>
        {picked !== null && (
          <Text dimColor>
            {picked} → {ROUTES[picked].model}
            {(await read($, pinned)) ? ' (pinned)' : ''}
          </Text>
        )}
        {tally.length > 0 && <Text dimColor>subagents: {tally.join(' · ')}</Text>}
        {count > 0 && (
          <Button
            key="inbox"
            label={`${count} new message${count === 1 ? '' : 's'}`}
            onPress={async () => {
              await update($, unread, () => 0);
              await $.ui.open({ id: INBOX, title: 'Inbox' });
            }}
          />
        )}
      </Box>
    );
  });

  on('ui.render', { component: 'Pane', requestId: INBOX }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const list = await read($, inbox);
    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No messages yet.</Text>}
        {list
          .slice()
          .reverse()
          .map((m) => (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>{m.from}</Text>
              <Text>{m.text}</Text>
            </Box>
          ))}
      </Box>
    );
  });
};
