# Contributing to BrewCMS

Thank you for your interest in contributing to BrewCMS! BrewCMS is an open-source, agent-ready content operating system for modern web applications.

## Code of Conduct

All contributors are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## Architectural Principles to Respect

1. **Modular Monolith**: Core domain logic lives in `packages/core` and must remain pure. It must **never** import framework or driver libraries (no Next.js, no React, no Drizzle, no HTTP, no direct SQL).
2. **Ports and Adapters**: Database, search, media, auth, and event implementations live behind clean interfaces (ports).
3. **Deterministic Content Kernel**: Revisions are immutable. Content IR compilation is deterministic with cryptographic hashing.
4. **Governed Agent Operations**: AI agents use the same application services as human editors. No agent may bypass policy, authorization, or audit trails.
5. **No Blind Dependency Upgrades**: Add dependencies only when well-justified.

## Development Workflow

### Prerequisites

- Node.js 20+ (Node.js 24 recommended)
- pnpm 9+ / 12+

### Setup

```bash
git clone https://github.com/victorkuldeep/brew-cms.git
cd brew-cms
pnpm install
pnpm build
pnpm test
```

### Quality Gates

Before submitting a Pull Request, ensure:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Submitting Pull Requests

- Keep PRs focused on a single responsibility.
- Write unit/integration tests for any new functionality or bug fix.
- Follow conventional commits where possible (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
