import type { AgentSpawnInput, CommandRunInput } from 'claude-code';
import { expect, test } from 'claude-code/testing';

import { CODEX_AGENT, ROUTES, tierOf } from '../hooks/register.tsx';

const command = (name: string, args: string): CommandRunInput => ({
  command: name,
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
});

const spawn = (over: Partial<AgentSpawnInput>): AgentSpawnInput => ({
  tool_use_id: 'toolu_1',
  prompt: 'Redesign the billing schema and migrate every caller',
  description: 'Billing migration',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...over,
});

test('classifier labels map to tiers', () => {
  expect(tierOf('deep: architecture')).toBe('deep');
  expect(tierOf('quick: a lookup')).toBe('quick');
  expect(tierOf(undefined)).toBe(null);
  expect(tierOf('something else')).toBe(null);
});

test('every route has a 1M window, so routing never forces a compaction', () => {
  const wide = new Set(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1']);
  for (const { model } of Object.values(ROUTES)) expect(wide.has(model)).toBe(true);
});

test('/triage pins a tier and reports its model', async ($) => {
  const pinned = await $.command.run(command('triage', 'deep'));
  expect(pinned.text).toContain(ROUTES.deep.model);
  const off = await $.command.run(command('triage', 'auto'));
  expect(off.text).toContain('Triage on.');
});

test('/send without a message shows usage', async ($) => {
  const r = await $.command.run(command('send', 'researcher'));
  expect(r.text).toContain('Usage');
});

test('a generic subagent with no model is routed by its task', async ($, on) => {
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  const r = await $.agent.spawn(spawn({}));
  expect(r.model).toBe(ROUTES.quick.model);
});

test('an explicit model, a fork or a custom agent type is left alone', async ($, on) => {
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({ model: 'opus' }))).model).toBe('opus');
  expect((await $.agent.spawn(spawn({ fork: true }))).model).toBe('inherited');
  expect((await $.agent.spawn(spawn({ subagentType: 'code-reviewer' }))).model).toBe('inherited');
});

test('triage off leaves subagents alone', async ($, on) => {
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  await $.command.run(command('triage', 'off'));
  expect((await $.agent.spawn(spawn({}))).model).toBe('inherited');
});

const jev = (choice: string, confidence: number) => ({
  value: {
    status: 200,
    ok: true,
    headers: { 'content-type': 'application/json' },
    text: JSON.stringify({
      model: 'jev-1.14.0',
      answers: { route: { type: 'choice', choice, confidence, probabilities: { [choice]: 0.9 } } },
      usage: { input_tokens: 100, output_tokens: 1 },
    }),
  },
});
const keyed = { options: { typesafe_api_key: 'ts-test' } };

test('a confident Jev answer routes a subagent without asking Haiku', keyed, async ($, on) => {
  const sent: { url: string; auth?: string; body: { model: string; questions: Record<string, { type: string }> } }[] = [];
  on('http.fetch', ($, e) => {
    sent.push({ url: e.url, auth: e.init?.headers?.Authorization, body: JSON.parse(e.init?.body ?? '{}') });
    return jev('deep', 0.8);
  });
  on('model.classify', () => ({ value: 'quick: haiku was asked' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.deep.model);
  const [request] = sent;
  expect(request?.url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(request?.auth).toBe('Bearer ts-test');
  expect(request?.body.model).toBe('jev-latest');
  expect(request?.body.questions.route?.type).toBe('choice');
});

test('TYPESAFE_API_KEY lets Jev decide when no key is configured', async ($, on) => {
  on('env.get', () => ({ value: 'ts-env' }));
  on('http.fetch', () => jev('deep', 0.8));
  on('model.classify', () => ({ value: 'quick: haiku was asked' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.deep.model);
  expect((await $.command.run(command('triage', ''))).text).toContain('Decided by jev-latest');
});

test('with no key Haiku decides and Jev is never called', async ($, on) => {
  let called = 0;
  on('env.get', () => ({ value: undefined }));
  on('http.fetch', () => {
    called++;
    return jev('deep', 0.8);
  });
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.quick.model);
  expect(called).toBe(0);
  expect((await $.command.run(command('triage', ''))).text).toContain('claude plugin configure switchboard');
});

test('an unsure Jev falls back to the Haiku classifier', keyed, async ($, on) => {
  on('http.fetch', () => jev('deep', 0.1));
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.quick.model);
});

test('a Jev error falls back to the Haiku classifier', keyed, async ($, on) => {
  on('http.fetch', () => ({
    value: { status: 401, ok: false, headers: { 'content-type': 'application/json' }, text: '{"detail":"bad key"}' },
  }));
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.quick.model);
});

const started = ($: unknown, e: AgentSpawnInput) => ({
  model: e.model ?? `${e.subagentType} (inherited)`,
  agentId: 'a1',
});

test('a subagent classified for Codex is handed to the codex agent', async ($, on) => {
  on('model.classify', () => ({ value: 'codex: hand over to Codex' }));
  on('agent.spawn', started);
  const r = await $.agent.spawn(spawn({}));
  expect(r.model).toBe(`${CODEX_AGENT} (inherited)`);
  expect((await $.command.run(command('triage', ''))).text).toContain('1 codex');
});

test('without the codex agent a handover is routed deep instead', async ($, on) => {
  on('model.classify', () => ({ value: 'codex: hand over to Codex' }));
  on('agent.spawn', ($, e) =>
    e.subagentType === CODEX_AGENT ? { deny: 'no such agent' } : started($, e)
  );
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.deep.model);
});

test('/triage codex off keeps Codex out of the subagent choices', async ($, on) => {
  const seen: string[][] = [];
  on('model.classify', ($, e) => {
    seen.push(e.labels);
    return { value: 'standard: an ordinary coding task' };
  });
  on('agent.spawn', started);
  expect((await $.command.run(command('triage', 'codex off'))).text).toContain('Codex handover off');
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.standard.model);
  expect(seen.length).toBe(1);
  expect(seen[0].some((l) => l.startsWith('codex'))).toBe(false);
});

const submit = (kind: 'composer' | 'bridge' | 'sdk' | 'task-notification') => ({
  text: 'Rename this variable',
  wait: false,
  origin: { kind },
});

test('a person prompt is triaged from the terminal, the Claude app or claude -p', async ($, on) => {
  let asked = 0;
  on('model.classify', () => {
    asked++;
    return { value: 'quick: a lookup' };
  });
  on('prompt.submit', ($, e) => ({ text: e.text }));
  for (const kind of ['composer', 'bridge', 'sdk'] as const) await $.prompt.submit(submit(kind));
  expect(asked).toBe(3);
  await $.prompt.submit(submit('task-notification'));
  expect(asked).toBe(3);
});
