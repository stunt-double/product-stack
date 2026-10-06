# Product Stack

An overview of the tools, services, AI tooling and integrations we use to build and run [Stunt Double](https://stuntdouble.io).

![Alt](https://repobeats.axiom.co/api/embed/a17878ddc109157f729b6faad269b9514ee84c80.svg "Repobeats analytics image")

## Daily Drivers

- **[Claude Code](https://claude.ai/code)**: Agentic development in the terminal, desktop app, web and cloud sessions
- **[Claude](https://claude.ai/)**: Desktop and web assistant, connected to our tools via MCP connectors
- **[Cursor](https://cursor.sh/)**: In-editor prompting
- **[Arc](https://arc.net/)**: Browser with Spaces and Boosts
- **[Linear](https://linear.app/)**: Issues, projects, cycles and triage
- **[Slack](https://slack.com/)**: Team communication
- **[1Password](https://1password.com/)**: Passwords, secrets and certificates
- **[Raycast](https://www.raycast.com/)**: Launcher and productivity workflows
- **[Homebrew](https://brew.sh/)**: macOS package manager

## Engineering

- **[TypeScript](https://www.typescriptlang.org/)**: One language across the full stack (TypeScript 6 and the native TypeScript 7 compiler)
- **[Next.js 16](https://nextjs.org/)**: App Router, Server Components, Turbopack and React 19
- **[Nx](https://nx.dev/)**: Monorepo with incremental builds and caching
- **[pnpm](https://pnpm.io/)**: Package manager (Node 22+)
- **[Vercel](https://vercel.com/)**: Hosting, preview deployments, Sandbox, OIDC, toolbar and BotID
- **[Supabase](https://supabase.com/)**: Postgres, auth, storage, realtime and preview branches per PR
- **[Upstash Redis](https://upstash.com/)**: Caching and rate limiting
- **[Trigger.dev v4](https://trigger.dev/)**: Background jobs, agent runs and orchestration
- **[Cloudflare Workers](https://workers.cloudflare.com/)**: Edge compute for inbound email and a Workers-hosted browser agent (Agents SDK, Workers AI, Browser Rendering)
- **[Tauri 2](https://tauri.app/)**: Native macOS desktop app
- **Swift**: Native iOS app
- **[Figma Plugin API](https://www.figma.com/plugin-docs/)**: Stunt Double for Figma
- **[Zod 4](https://zod.dev/)**: Schema validation
- **[ESLint](https://eslint.org/)** + **[Prettier](https://prettier.io/)**: Linting and formatting
- **[Changesets](https://github.com/changesets/changesets)** + **[tsup](https://tsup.egoist.dev/)**: Versioning and builds for our open source packages
- **[GitHub](https://github.com/)**: Source control, Actions and the GitHub Packages registry

## Design

- **[Figma](https://www.figma.com/)**: Design, slides, prototyping, design system and Code Connect
- **[shadcn/ui](https://ui.shadcn.com/)** + **[Radix UI](https://www.radix-ui.com/)**: Component foundations for our `@stuntdouble/ui` design system
- **[Tailwind CSS v4](https://tailwindcss.com/)**: Utility-first styling
- **[Fumadocs](https://fumadocs.dev/)**: Brand and design system documentation site
- **[React Spring](https://www.react-spring.dev/)**: Animation
- **[Three.js](https://threejs.org/)** + **[Paper Shaders](https://shaders.paper.design/)**: Shaders and visual effects
- **[React Flow](https://reactflow.dev/)**: Node-based workflow and diagram editors
- **[Mermaid](https://mermaid.js.org/)**: Diagrams
- **[Klim](https://klim.co.nz/)**: Fonts
- **Continuity icons**: Our in-house icon pack ([`@stunt-double/icons`](https://github.com/stunt-double/stuntkit))
- **Rotato**: Product mockups and video

## AI and Agents

- **[Anthropic Claude](https://www.anthropic.com/)**: Primary model family via the Anthropic SDK, Vertex AI and the [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview)
- **[Vercel AI SDK v7](https://ai-sdk.dev/)**: Unified interface across Anthropic, OpenAI, Google and Vertex, with MCP and OpenTelemetry support
- **[Google Vertex AI](https://cloud.google.com/vertex-ai)**: Claude and Gemini via Google Cloud
- **[OpenAI](https://openai.com/)**: Embeddings and supporting models
- **[Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)**: Models at the edge
- **[Browserbase](https://www.browserbase.com/)** + **[Stagehand v4](https://stagehand.dev/)**: Browser infrastructure for our AI actors
- **[Puppeteer](https://pptr.dev/)** + **[Cloudflare Browser Rendering](https://developers.cloudflare.com/browser-rendering/)**: Browser drivers
- **[Tavily](https://tavily.com/)**: Web search for agents
- **[Cline Agents](https://github.com/cline/cline)**: Agent runtime experiments
- **[MCP](https://modelcontextprotocol.io/)**: Our own remote MCP server (OAuth 2.1, also shipped as an MCPB bundle), plus customer-supplied MCP servers for actors during runs
- **[Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)**: Published from our site at `/.well-known/agent-skills` and in [stuntkit](https://github.com/stunt-double/stuntkit)

## Claude Code Setup

### MCP connectors

Connected to Claude Code and Claude across the team:

| Connector | Used for |
| --- | --- |
| **[Stunt Double](https://stuntdouble.io)** | Dogfooding: actors, checklists, interviews, workflows, feedback and the Stunt Double Index |
| **GitHub** | Repos, PRs, reviews and CI |
| **Linear** | Issues, projects, cycles and docs |
| **Vercel** | Deployments, logs, env vars, flags and analytics |
| **Supabase** | Database, migrations, branches, type generation and advisors |
| **Cloudflare Developer Platform** | Workers, D1, KV, R2 and Hyperdrive |
| **Figma** | Design context, Code Connect, diagrams and generation |
| **Graphify** | Code graph search, call graphs and change impact across our repos |
| **Stripe** | Billing, products and analytics |
| **Resend** | Email, broadcasts, templates and inboxes |
| **Slack** | Messages, threads and canvases |
| **Attio** | CRM, notes, meetings and pipeline |
| **Opinly** | SEO, AI search visibility and blog publishing |
| **Vibe Prospecting** | Company and contact enrichment |
| **Gmail**, **Google Calendar**, **Google Drive** | Email, scheduling and files |
| **Xero** | Accounting and financial reports |
| **Airwallex** | Business accounts, cards and billing |

### Skills

- **Anthropic skills**: `docs`, `docx`, `pdf`, `pptx`, `xlsx`, `skill-creator`, `mcp-builder`, `web-artifacts-builder`, `google-workspace`
- **Figma skills**: `figma-use`, `figma-generate-design`, `figma-generate-library`, `figma-code-connect`, `figma-design-to-code`, `figma-generate-diagram`
- **Supabase agent skills**: `npx skills add supabase/agent-skills`
- **Stunt Double skills**: `stunt-double` (`npx skills add stunt-double/stuntdouble-mcp`), plus `stunt-double-wao`, `stunt-double-browser-toolset` and `stunt-double-spelling` in [stuntkit](https://github.com/stunt-double/stuntkit)
- **Built in**: `/code-review`, `/security-review`, `/simplify`, `/init`, `/loop` and `/run`

### Working agreements

- `CLAUDE.md` at the repo root (and per app where needed) documents the monorepo, conventions and agents
- Linear-style branch names: `feature/PRO-[ID]-[title]`
- Cloud sessions open PRs and watch CI; Vercel previews and Supabase preview branches are created per PR
- Supabase `database.ts` is generated, never hand-edited
- See [`engineering/.cursorrules`](engineering/.cursorrules) for code conventions

## Open Source

- **[stuntkit](https://github.com/stunt-double/stuntkit)**: Our open source packages
  - `@stunt-double/browser-toolset`: Browser tools for AI agents over a provider-neutral driver, including an executor for Anthropic's browser-use toolset
  - `@stunt-double/wao`: Web Agent Optimiser, a drop-in script that repairs page semantics so AI agents can read them
  - `@stunt-double/spelling`: US, UK and Canadian spelling localisation
  - `@stunt-double/icons`: The Continuity icon pack

## Payments and Email

- **[Stripe](https://stripe.com/)**: Payments and subscriptions
- **[Resend](https://resend.com/)**: Transactional and marketing email
- **[React Email](https://react.email/)**: Email templates
- **[Svix](https://www.svix.com/)**: Webhook verification
- **[postal-mime](https://github.com/postalsys/postal-mime)**: Inbound email parsing on Workers
- **Web Push**: Browser and iOS notifications

## Observability

- **[Vercel Analytics](https://vercel.com/analytics)**: Web analytics
- **[Vercel Speed Insights](https://vercel.com/docs/speed-insights)**: Core Web Vitals
- **[Vercel Flags](https://vercel.com/docs/feature-flags)**: Feature flags via the Flags SDK
- **[OpenTelemetry](https://opentelemetry.io/)**: Tracing via `@vercel/otel` and AI SDK telemetry
- **[rrweb](https://www.rrweb.io/)**: Session recording and replay of actor runs
- **[Pino](https://getpino.io/)**: Structured logging

## Security and Networking

- **[Cloudflare Zero Trust](https://www.cloudflare.com/zero-trust/)**: Domain access and private VPN (free up to 50 users)
- **[Supabase Auth](https://supabase.com/auth)**: Google, Apple and magic link sign-in
- **[Vercel BotID](https://vercel.com/docs/botid)**: Bot protection
- **OAuth 2.1 + PKCE**: For our MCP server and agent connections

## Growth and Sales

- **[Attio](https://attio.com/)**: CRM
- **[Opinly](https://opinly.ai/)**: Content, SEO and AI search visibility
- **[Vibe Prospecting](https://www.explorium.ai/)**: Prospecting and enrichment

## Operations

- **[Xero](https://www.xero.com/)**: Accounting
- **[Airwallex](https://www.airwallex.com/)**: Business accounts, cards and FX
- **Google Workspace**: Email, calendar and drive
- **BusyCal**: Calendar
- **Reclaim.ai**: Smart scheduling

## Productivity

- **Apple Notes**
- **Bartender**
- **Better Display**
