# Global Capabilities Summary

This document provides a comprehensive overview of your system's global capabilities: **Skills**, **Plugins (MCP Servers)**, **Modes**, and **Actions (Tools & Commands)**.

---

## 1. Operational Modes

### Core System Modes
- **Planning Mode**: Structured workflow triggered for multi-file architectural changes or complex tasks. Follows a strict protocol: `Research` → `Create Implementation Plan` → `Obtain User Approval` → `Execute` → `Verify`.
- **Interactive / Direct Execution Mode**: Lightweight path for single-file tweaks, direct questions, log inspection, or quick bug fixes without requiring a formal plan.

### Behavioral Operational Modes (`behavioral-modes`)
- **Brainstorm Mode**: High-level architectural exploration, trade-off evaluation, and design decision mapping.
- **Implement Mode**: Precision code construction adhering strictly to codebase guidelines (`AGENTS.md`) and design contracts.
- **Debug Mode**: Empirical log-first root-cause diagnosis without symptom masking or swallowed errors.
- **Review Mode**: In-depth security, performance, and maintainability audits against explicit checklists.
- **Teach Mode**: Conceptual explanations, interactive architectural walkthroughs, and technical mentoring.
- **Ship Mode**: Verification of release readiness, changelog synthesis, and CI/CD workflow validation.
- **Orchestrate Mode**: Task decomposition, parallel subagent delegation, and progress synchronization.

---

## 2. Plugins (MCP Servers)

### 1. `claude-mem`
*Persistent memory architecture and intelligent context graph indexing.*
- **Available Tools**: `important_workflow`, `search`, `timeline`, `get_observations`, `session_start_context`, `smart_search`, `smart_unfold`, `smart_outline`, `build_corpus`, `list_corpora`, `prime_corpus`, `query_corpus`, `rebuild_corpus`, `reprime_corpus`.

### 2. `code-review-graph`
*Codebase structural graph analysis, flow tracing, and change impact radius modeling.*
- **Available Tools**: `build_or_update_graph_tool`, `run_postprocess_tool`, `get_minimal_context_tool`, `get_impact_radius_tool`, `query_graph_tool`, `get_review_context_tool`, `semantic_search_nodes_tool`, `list_flows_tool`, `get_flow_tool`, `get_affected_flows_tool`, `get_architecture_overview_tool`, `detect_changes_tool`, `refactor_tool`, `generate_wiki_tool`, `get_hub_nodes_tool`, `get_bridge_nodes_tool`.

---

## 3. Actions & Tools

### Native System Tools
- **File Operations**:
  - `view_file`: Read text/code, images, PDFs, audio, and video files.
  - `write_to_file`: Create new files or artifacts.
  - `replace_file_content`: Make precise block replacements in existing files.
  - `find_by_name`: Fast glob search using `fd`.
  - `grep_search`: Pattern search across files using `ripgrep`.
  - `list_dir`: Inspect directory structure and child sizes.
- **Execution & Tasks**:
  - `run_command`: Execute shell commands (macOS/zsh).
  - `manage_task`: Monitor, list, feed input to, or terminate background processes.
  - `schedule`: Set one-shot timers or recurring cron notifications.
- **Subagent Swarms**:
  - `invoke_subagent`: Launch concurrent background subagents.
  - `define_subagent`: Create new specialized subagent roles on demand.
  - `manage_subagents`: Monitor, list, or terminate subagents.
  - `send_message`: Communicate directly with subagents or peer agents.
- **MCP & Web Integration**:
  - `call_mcp_tool`: Invoke lazily-loaded MCP server tools.
  - `list_resources` / `read_resource`: Access MCP data resources.
  - `search_web`: Semantic web search with citations.
  - `read_url_content`: Fetch and convert web pages to markdown.
- **Interaction & Generation**:
  - `ask_question`: Interactive multi-choice feedback dialogs for ambiguous decisions.
  - `generate_image`: AI image generation and UI mockups.

### Subagent Types
- **`self`**: Privileged subagent inheriting full execution rights, tools, and model configuration.
- **`research`**: Fast read-only subagent for broad codebase exploration and web research.
- **Dynamic Subagents**: Custom subagent roles defined during execution.

### User Slash Commands
- `/goal`: Autonomous long-running task execution without stopping until completion.
- `/schedule`: Set background reminders or cron schedules.
- `/browser`: Engage interactive web research and browser automation.
- `/grill-me`: Interactive requirement gathering and design alignment interview.
- `/teamwork-preview`: Orchestrate multi-agent worker swarms for large projects.
- `/learn`: Save workspace rules and developer preferences.
- `/boost`: Deep reasoning, strategic multi-perspective planning, and verification.

---

## 4. Global Skills System (~1,264 Skills)

Global skills are stored in `~/.gemini/config/skills` and provide domain-specific knowledge and instructions.

### Category Breakdown

#### 💻 Languages & Frameworks
- **Frontend / Mobile / UI**:
  - React & Next.js: `react-patterns`, `react-best-practices`, `nextjs-best-practices`, `shadcn`, `tailwind-patterns`
  - Angular, Svelte & Vue: `angular`, `angular-best-practices`, `sveltekit`, `hono`, `astro`
  - Mobile & Native: `flutter-expert`, `expo-api-routes`, `expo-deployment`, `expo-dev-client`, `expo-tailwind-setup`, `avalonia-zafiro-development`, `makepad-skills`
- **Backend & Systems**:
  - TypeScript / Node.js: `typescript-pro`, `javascript-pro`, `trpc-fullstack`, `hono`, `fp-backend`
  - Python: `python-fastapi-development`, `fastapi-pro`, `django-pro`, `python-pro`
  - Rust & Go: `rust-pro`, `bevy-ecs-expert`, `golang-pro`, `go-playwright`, `go-rod-master`
  - Systems & Enterprise: `c-pro`, `cpp-pro`, `dotnet-architect`, `dotnet-backend`, `elixir-pro`, `haskell-pro`, `php-pro`, `ruby-pro`, `julia-pro`
  - Shell / Automation: `bash-pro`, `bash-linux`, `bash-scripting`, `powershell-windows`, `posix-shell-pro`

#### 🤖 AI, Machine Learning & LLM Engineering
- **Agents & Workflows**: `pydantic-ai`, `ai-ml`, `llm-app-patterns`, `langchain-architecture`, `rag-engineer`, `memory-systems`, `evaluation`, `agent-memory-mcp`
- **Generative Media**: `fal-generate`, `fal-audio`, `fal-image-edit`, `fal-upscale`, `fal-workflow`, `imagen`, `remotion`, `remotion-best-practices`, `videodb-skills`
- **ML & Data Science**: `scikit-learn`, `mlops-engineer`, `azure-ai-ml-py`, `machine-learning-ops-ml-pipeline`

#### 🏗️ Architecture, Quality & Debugging
- **Workflows & Paradigms**: `test-driven-development`, `tdd-workflow`, `executing-plans`, `writing-plans`, `concise-planning`, `subagent-driven-development`, `systematic-debugging`, `bug-hunter`, `debugger`
- **Software Design**: `architect-review`, `backend-architect`, `domain-driven-design`, `ddd-strategic-design`, `ddd-context-mapping`, `c4-container`, `core-components`, `vibe-code-auditor`
- **Functional Programming**: `fp-async`, `fp-backend`, `fp-data-transforms`, `fp-errors`, `fp-pragmatic`, `fp-react`, `fp-refactor`

#### ☁️ Cloud, DevOps & Security
- **Cloud Infrastructure**: `aws-skills`, `aws-cost-optimizer`, `aws-cost-cleanup`, `azure-identity-py`, `azure-keyvault-py`, `azure-storage-blob-py`, `azure-cosmos-py`, `cloudflare-workers-expert`, `vercel-deployment`, `render-automation`, `convex`
- **DevOps & Containers**: `cloud-devops`, `kubernetes-deployment`, `terraform-specialist`, `terraform-skill`, `devops-troubleshooter`, `deployment-engineer`, `incident-responder`
- **Security & Auditing**: `007` (STRIDE/PASTA threat modeling & audit), `vulnerability-scanner`, `security-auditor`, `red-team-tactics`, `mobile-security-coder`, `varlock-claude-skill`, `code-review-checklist`, `codex-review`, `fix-review`

#### 📊 Databases & Data Engineering
- **Database Architecture**: `postgresql`, `database-admin`, `database-design`, `database-optimizer`, `database-migrations-migration-observability`, `drizzle-orm-expert`, `prisma-expert`, `azure-cosmos-java`, `claimable-postgres`

#### 🔌 Integrations & Web Automation
- **SaaS & Workflows**: `notion-automation`, `linear-automation`, `linear-claude-skill`, `asana-automation`, `hubspot-automation`, `zendesk-automation`, `square-automation`, `telegram`, `agentmail`
- **Web Scraping & Search**: `exa-search`, `tavily-web`, `search-specialist`, `firecrawl-scraper`, `apify-trend-analysis`, `last30days`, `context7-auto-research`, `youtube-summarizer`

#### 🎨 Design, UX & Content
- **UI/UX Design**: `ui-ux-designer`, `magic-ui-generator`, `magic-animator`, `animejs-animation`, `spline-3d-integration`, `iconsax-library`, `design-spells`, `design-md`, `frontend-slides`
- **Apple HIG Guidelines**: `hig-foundations`, `hig-patterns`, `hig-platforms`, `hig-components-content`, `hig-components-dialogs`, `hig-components-layout`, `hig-components-search`, `hig-components-status`

#### 📈 Business, Product & Growth
- **Product & Growth**: `product-manager`, `pricing-strategy`, `copywriting`, `seo-audit`, `programmatic-seo`, `page-cro`, `popup-cro`, `geo-fundamentals`, `hr-pro`, `sred-project-organizer`, `risk-manager`

---
