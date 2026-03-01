# BGA2 Project Conventions

## Development Environment

- **All build/lint/typecheck/test commands must run through Docker** — no local tooling installs. Use `docker compose exec client ...` or `docker compose exec server ...` for NX, npm, tsc, etc.
- Docker Compose file: `apps/infra/docker-compose.yml`
- Client service: `client` (SvelteKit on port 5173)
- Server service: `server` (C# API on port 8080)
- DB service: `db` (PostgreSQL on port 5432)

## Shell Commands

- Avoid `$(...)` command substitution in bash — causes interactive confirmation prompts that block automation.
- Use plain variables or pipes instead.

## Puppeteer Screenshot Harness

For visual verification without local installs:
```bash
docker run --rm --network infra_bga2 -v "$(pwd)"/apps/infra/screenshot/output:/screenshots bga2-screenshot "http://client:5173/game/test"
```
Note: the screenshot command above is an exception — it uses a pre-built image, not command substitution in a problematic way.
Screenshots land in `apps/infra/screenshot/output/`.
