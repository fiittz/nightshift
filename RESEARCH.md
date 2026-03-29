# Trovek — Research Notes

## Sources Studied
- **Dify** — marketplace, RAG, workflow engine, provider abstraction
- **OpenHands** — Action/Observation pattern, sandbox execution, event sourcing
- **n8n** — visual workflow editor, node canvas, Vue Flow
- **gstack** — Garry Tan's AI skills, Six Forcing Questions, Iron Law
- **MetaGPT** — AI Software Company, role SOPs, artifact pipeline
- **Composio** — parallel agent orchestration, CI fixes, merge conflicts (pending)

## Key Patterns Adopted

### From OpenHands
- Action → Execution → Observation (implemented in engine.mjs)
- Immutable event log (implemented)
- Workspace abstraction (implemented)

### From gstack
- Six Forcing Questions for CEO (implemented)
- Iron Law: no fixes without root cause (implemented in QA + Investigate)
- Anti-sycophancy in agent prompts (implemented)
- Review tiers: Quick/Standard/Exhaustive (implemented)

### From MetaGPT (TO IMPLEMENT)
- Global message pool with cause_by routing
- Structured artifacts: PRD → Design → Tasks → Code → Tests
- Verification loops with retry limits (3 max)
- Each role produces a specific document type

### From Dify (TO IMPLEMENT)
- BaseAgentRunner class
- YAML-configured LLM providers
- Knowledge pipeline: parse → chunk → embed
- Plugin system with 5 types

### From n8n (TO IMPLEMENT)
- Grid canvas with snap for flow editor
- Drag output→input connections
- Status icons on nodes during execution
