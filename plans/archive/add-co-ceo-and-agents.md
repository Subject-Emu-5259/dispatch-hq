# Add Co-CEO Agent & Complete Agent/Skill Suite

Create a Co-CEO orchestrator agent that serves as the primary interface between the user and the agent team, plus fill gaps in the agent and skill roster for Dispatch HQ.

## Project Summary

**Dispatch HQ** — Real-time emergency dispatch simulation game. Monorepo (pnpm + Turbo) with React 19 SPA frontend (MapLibre GL, Zustand, Tailwind, Framer Motion), Hono game server (Drizzle ORM, PostgreSQL+PostGIS, Redis, BullMQ), shared types package, and game engine library. Currently v0.3.0-alpha with client-side simulation; server is placeholder. Zero tests exist.

Existing agents: planner, builder, designer, reviewer (linear pipeline).
Existing skills: ai-code-review, incremental-implementation, planning-and-task-breakdown, spec-driven-development, git-commit, frontend-design, pandaos-design.

## What Gets Built

1. **Co-CEO agent** (`co-ceo`) — the orchestrator and user's single point of contact
2. **5 new agents** filling critical gaps for a game project
3. **4 new skills** supporting the new agents
4. **Updated AGENTS.md** to reflect the new hierarchy

***

## Tasks

### Phase 1: Co-CEO Agent (orchestrator)

* [ ] **Task 1.1: Create `.pandaos/team/co-ceo.md`**
  * Files: `.pandaos/team/co-ceo.md` (new)
  * Define the Co-CEO persona: project owner proxy, first point of contact, pipeline orchestrator
  * Responsibilities: route tasks to agents, coordinate multi-agent workflows, report status to user, make executive scope/trade-off decisions, maintain project roadmap awareness, run standup-style status checks
  * Pipeline orchestration: receive user request → classify scale → invoke planner (or skip for quick) → gate check at each phase → report completion to user
  * Ad-hoc mode: answer questions directly for trivial asks, delegate to specialists for anything substantive
  * Status reporting: after any agent completes, Co-CEO summarizes what happened, what changed, any blockers, and next steps — in 2-3 bullet points
  * State tracking: reads `.pandaos/features/` and `.pandaos/logs/` to know current project state without asking
  * Color: `#06b6d4` (cyan), icon: `briefcase`
  * Skills: none (orchestrator-only — delegates to specialists)
* [ ] **Task 1.2: Add Co-CEO to AGENTS.md agent table**
  * Files: `AGENTS.md` (edit)
  * Add co-ceo row: trigger "Always — first point of contact for any task", instructions `.pandaos/team/co-ceo.md`

### Phase 2: Missing Agents

* [ ] **Task 2.1: Create `.pandaos/team/devops.md`**
  * Files: `.pandaos/team/devops.md` (new)
  * Trigger: Docker, CI/CD, deployment, infrastructure, environment setup, package updates
  * Skills: docker-management (new)
  * Color: `#8b5cf6` (violet), icon: `server`
  * Handles: docker-compose management, database provisioning, Redis config, CI pipeline setup (GitHub Actions), environment variable management, dependency updates, build optimization
* [ ] **Task 2.2: Create `.pandaos/team/qa-engineer.md`**
  * Files: `.pandaos/team/qa-engineer.md` (new)
  * Trigger: Test writing, test strategy, test automation, coverage gaps
  * Skills: test-generation (new)
  * Color: `#14b8a6` (teal), icon: `flask-conical`
  * Handles: unit tests, integration tests, E2E tests (Playwright), test strategy docs, coverage analysis, CI test configuration, regression prevention
* [ ] **Task 2.3: Create `.pandaos/team/data-engineer.md`**
  * Files: `.pandaos/team/data-engineer.md` (new)
  * Trigger: Database schema changes, migrations, query optimization, data modeling
  * Skills: database-migration (new)
  * Color: `#f97316` (orange), icon: `database`
  * Handles: Drizzle schema design, migration generation, query optimization, PostGIS spatial queries, Redis caching patterns, data seeding, backup strategies
* [ ] **Task 2.4: Create `.pandaos/team/game-designer.md`**
  * Files: `.pandaos/team/game-designer.md` (new)
  * Trigger: Game mechanics, balancing, economy tuning, progression systems, mission design
  * Skills: game-balancing (new)
  * Color: `#ec4899` (pink), icon: `gamepad-2`
  * Handles: mission template design, difficulty curves, economy balancing (credits/XP/coins), unit stat tuning, spawn rate calibration, progression pacing, premium monetization balance
* [ ] **Task 2.5: Create `.pandaos/team/docs-writer.md`**
  * Files: `.pandaos/team/docs-writer.md` (new)
  * Trigger: Documentation, release notes, ADRs, API docs, README updates
  * Color: `#a3e635` (lime), icon: `book-open`
  * Handles: README updates, RELEASES.md entries, ADR writing, API documentation, inline code documentation, developer onboarding guides, changelog generation

### Phase 3: New Skills

* [ ] **Task 3.1: Create `.pandaos/skills/docker-management/SKILL.md`**
  * Files: `.pandaos/skills/docker-management/SKILL.md` (new)
  * Steps: read docker-compose.yml → check container health → start/stop/restart services → verify connectivity → manage volumes → add new services
* [ ] **Task 3.2: Create `.pandaos/skills/database-migration/SKILL.md`**
  * Files: `.pandaos/skills/database-migration/SKILL.md` (new)
  * Steps: read current schema → generate Drizzle migration → review SQL output → dry-run safety check → apply migration → verify schema matches ORM definitions → handle rollback
* [ ] **Task 3.3: Create `.pandaos/skills/game-balancing/SKILL.md`**
  * Files: `.pandaos/skills/game-balancing/SKILL.md` (new)
  * Steps: analyze current game constants → calculate progression curves → simulate player progression → identify bottlenecks/pain points → propose tuned values → document rationale with spreadsheet-style analysis
* [ ] **Task 3.4: Create `.pandaos/skills/test-generation/SKILL.md`**
  * Files: `.pandaos/skills/test-generation/SKILL.md` (new)
  * Steps: identify test targets from source → pick test framework (Vitest for frontend, Node test runner or Vitest for backend) → write unit tests for pure logic → write integration tests for API endpoints → write component tests for UI → ensure edge case coverage → verify tests pass

### Phase 4: Hierarchy & Coordination Update

* [ ] **Task 4.1: Update AGENTS.md with complete agent roster and hierarchy**
  * Files: `AGENTS.md` (edit)
  * Add all 9 agents to the team members table (co-ceo, planner, designer, builder, reviewer, devops, qa-engineer, data-engineer, game-designer, docs-writer)
  * Document the orchestration flow: user → Co-CEO → routes to specialist(s) → Co-CEO aggregates & reports back
  * Add "When to invoke" triggers for each new agent
* [ ] **Task 4.2: Update `.pandaos/config.yaml` with new paths**
  * Files: `.pandaos/config.yaml` (edit)
  * Add paths: `tests/`, `benchmarks/`, `game_design/`, `docs/api/`

***

## Architecture: Agent Hierarchy

```
User (De'Andrew Harris)
  │
  ▼
┌─────────────────────────────────────────────┐
│  Co-CEO (orchestrator, single POC)          │
│  - Receives ALL tasks from user             │
│  - Classifies & routes to specialists       │
│  - Coordinates multi-agent pipelines        │
│  - Reports status, blockers, next steps     │
│  - Makes executive scope/trade-off calls    │
└──────────┬──────────────────────────────────┘
           │
    ┌──────┼──────────┬──────────┬──────────┐
    ▼      ▼          ▼          ▼          ▼
┌────────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Planner │ │Designer│ │Builder│ │Reviewer│ │DevOps│
└────────┘ └───────┘ └──────┘ └──────┘ └──────┘
    │                              │
    └── Linear pipeline ──────────┘
    
Specialist agents (invoked as needed):
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│   QA     │ │  Data    │ │  Game    │ │  Docs    │
│ Engineer │ │ Engineer │ │ Designer │ │  Writer  │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

## Agent Invocation Rules (for Co-CEO)

| User says...                                            | Co-CEO delegates to...                  |
| ------------------------------------------------------- | --------------------------------------- |
| "Build X feature" / "Add Y"                             | Planner (then pipeline)                 |
| "Fix this bug" (trivial, 1 file)                        | Builder directly                        |
| "What does the codebase do?" / "How does X work?"       | Co-CEO answers directly                 |
| "Deploy" / "Set up Docker" / "CI/CD"                    | DevOps                                  |
| "Write tests for X" / "Add test coverage"               | QA Engineer                             |
| "Change the database schema" / "Add a table"            | Data Engineer                           |
| "This mission is too hard/easy" / "Balance the economy" | Game Designer                           |
| "Write docs for X" / "Update README"                    | Docs Writer                             |
| "Review this PR" / "Is this code good?"                 | Reviewer                                |
| Complex feature with UI                                 | Planner → Designer → Builder → Reviewer |
| Backend-only feature                                    | Planner → Builder → Reviewer            |

## Risks & Decisions Needed

1. **Agent file format**: The existing agents follow a specific markdown format with YAML frontmatter (`---`) and `_system` instructions. New agents must match this exactly, including the `agent_activate`/`agent_deactivate` tool call pattern.
2. **Skill file format**: Existing skills use YAML frontmatter with `allowed-tools`, `user-invocable`, `source` fields. New skills should follow the same pattern.
3. **Co-CEO as persona vs sub-agent**: The Co-CEO should be an **on-demand team member persona** (like planner/builder/etc.), NOT launched via Task tool. This means the main agent adopts the Co-CEO role by reading its instructions and activating via `agent_activate`. When the Co-CEO delegates work, it uses the Task tool to launch specialist sub-agents.
4. **Pipeline handoff changes**: Currently, each agent calls `agent_deactivate` and invokes the next via Task tool. The Co-CEO should intercept these handoffs — when an agent finishes, control returns to Co-CEO, who verifies completion and either proceeds to the next phase or reports to the user.
5. **No emoji constraint**: Per pandaos-design skill rules, no emoji glyphs in any output. Agent names and descriptions must use text/labels only.
6. **Existing git repo**: All changes should be made as commits in the existing git repo at `/Users/deandrewharris/Games Projects/dispatch-hq`.