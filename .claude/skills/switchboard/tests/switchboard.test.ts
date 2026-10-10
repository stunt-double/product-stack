import type { AgentSpawnInput, CommandRunInput } from 'claude-code';
import { expect, test } from 'claude-code/testing';

import { ROUTES, tierOf } from '../hooks/register.tsx';

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
  expect(off.text).toBe('Triage on.');
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

const laya = (choice: string, confidence: number) => ({
  value: { content: [{ type: 'text', text: JSON.stringify({ choice, confidence }) }] },
});

test('a confident local laya answer routes a subagent without asking Haiku', async ($, on) => {
  on('mcp.call', () => laya('deep', 0.4));
  on('model.classify', () => ({ value: 'quick: haiku was asked' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.deep.model);
});

test('an unsure laya falls back to the Haiku classifier', async ($, on) => {
  on('mcp.call', () => laya('deep', 0.02));
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.quick.model);
});

test('a laya error falls back to the Haiku classifier', async ($, on) => {
  on('mcp.call', () => ({ value: { isError: true, content: [{ type: 'text', text: 'down' }] } }));
  on('model.classify', () => ({ value: 'quick: a lookup' }));
  on('agent.spawn', ($, e) => ({ model: e.model ?? 'inherited', agentId: 'a1' }));
  expect((await $.agent.spawn(spawn({}))).model).toBe(ROUTES.quick.model);
});
