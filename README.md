# 🤖 Fullsend Discord Bot

![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.10-43853d?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)
![Discord.js](https://img.shields.io/badge/discord.js-14-5865f2?logo=discord&logoColor=white)
[![CI](https://github.com/lgarceau768/ts_discord_fullsend_bot/actions/workflows/ci.yml/badge.svg)](https://github.com/lgarceau768/ts_discord_fullsend_bot/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)](#)

> An open-source, TypeScript-first Discord bot that keeps your media requests, download pipeline, price watches, and even houseplants on track. 🌱🎬

## 🧭 Table of Contents

- [Features](#features)
- [Slash Commands](#slash-commands)
- [Integrations](#integrations)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [Development Scripts](#development-scripts)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🎯 **Slash command toolkit** – Modular command architecture with typed handlers (`SlashCommand`) and automatic registration scripts.
- 🎬 **Media discovery & requests** – `/search` threads results from your n8n Trakt workflow and `/request` sends the pick straight to Jellyseerr.
- 📥 **Download visibility** – `/downloads` summarizes qBittorrent activity with live progress, speeds, and ETAs.
- 👀 **Price & change watching** – `/watch` subcommands talk to ChangeDetection.io, tag entries, and sync metadata into Postgres.
- 🌿 **Plant concierge** – `/plant` commands log care, upload photos via n8n, schedule reminders, and keep notes organized.
- 🗃️ **Shared database service** – `services/database.service.ts` centralizes Postgres connectivity with SQL kept in `src/sql/` files.
- 🧰 **Modern toolchain** – TypeScript, ESLint (flat configs), Prettier, lint-staged, Husky, and Docker-compose support out of the box.

## Slash Commands

| Command                                          | What it does                                                                                                   | Key integrations  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------- | ------ | ------ | ------ | ------- | ----------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------ | --- |
| `/ping`                                          | Health check that round-trips Discord and reports latency.                                                     | —                 |
| `/search query:<title> type:<movie\|show\|both>` | Launches a result thread powered by Trakt via n8n, complete with rich embeds and quick follow-up instructions. | n8n, Trakt        |
| `/request index:<n> seasons:<mode?>`             | Converts the cached `/search` result into a Jellyseerr request (smart defaults for seasons).                   | Jellyseerr        |
| `/downloads`                                     | Lists active torrents, speeds, and ETAs from qBittorrent.                                                      | qBittorrent WebUI |
| `/watch add                                      | list                                                                                                           | minimal           | full   | update | remove | latest` | Administers ChangeDetection watches, keeps history in Postgres, and renders informative embeds. | ChangeDetection.io, PostgreSQL |
| `/plant add                                      | get                                                                                                            | list              | update | delete | water  | photo   | care                                                                                            | reminder`                      | Manages your plant collection, water logs, reminders, and photo gallery through an n8n workflow. | n8n |

## Integrations

- 🔌 **Discord** – Built on `discord.js` v14 with slash command registration scripts for guild or global rollout.
- 🤖 **n8n** – Customizable webhooks for media search, plant care, spell-check, and photo ingestion.
- 🍿 **Jellyseerr** – Turns requests into actionable downloads, honoring default season settings.
- 💾 **ChangeDetection.io** – Creates and synchronizes watches, stores tags, and fetches history snapshots.
- 🐘 **PostgreSQL** – Persists user/watch relationships, sync state, and notification metadata.
- 📦 **qBittorrent** – Surfaces download pipeline health without leaving Discord.

## Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Populate the required values:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` _(optional dev guild)_
   - `N8N_SEARCH_URL`, `N8N_PLANT_API_URL`, `N8N_API_KEY`
   - `JELLYSEERR_URL`, `JELLYSEERR_API_KEY`, `JELLYSEERR_SERIES_DEFAULT`, `JELLYSEERR_4K`
   - `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD`
   - `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`, `PGSSL`
   - `CHANGEDETECTION_URL`, `CHANGEDETECTION_NOTIFICATION_URL`, `CHANGEDETECTION_NOTIFICATION_TEMPLATE_PATH`

> 💡 Tip: The `/watch` command will automatically create tags in ChangeDetection and mirror metadata locally once Postgres connectivity is configured.

## Getting Started

```bash
npm install
npm run register:dev   # Register slash commands against your dev guild
npm run dev            # Hot-reload bot with TSX
```

### Production / Deployment

```bash
npm run build
npm start
```

Or ship via Docker Compose:

```bash
docker-compose up --build
```

## Development Scripts

| Script                                             | Description                                             |
| -------------------------------------------------- | ------------------------------------------------------- |
| `npm run lint`                                     | Lint the project with ESLint (type-aware for `src/**`). |
| `npm run lint:fix`                                 | Lint and apply auto-fixes.                              |
| `npm run format`                                   | Format using Prettier (settings mirrored in ESLint).    |
| `npm run typecheck`                                | Run `tsc --noEmit` for full type coverage.              |
| `npm run register:dev` / `npm run register:global` | Register slash commands on your guild or globally.      |
| `npm run build`                                    | Compile TypeScript to `dist/`.                          |

## Tooling

We rely on a consistent set of tools to keep the codebase healthy:

- **TypeScript** for static typing across commands, services, and integrations.
- **ESLint** (flat config) with **Prettier** for linting and formatting; enforced via `lint-staged` and **Husky** pre-commit hooks.
- **Vitest** for integration and utility tests, with coverage reporting via `@vitest/coverage-v8`.
- **tsx** for fast TypeScript execution in local scripts (e.g., command registration and dev server).
- **dotenv** plus **zod** to load and validate environment configuration.
- **pg** for Postgres connectivity, wrapped in `services/database.service.ts`.

## Project Structure

```
src/
├─ commands/            # Slash command handlers (ping, search, request, downloads, plant, watch/...)
├─ events/              # Discord event listeners wired in `src/index.ts`
├─ integrations/        # API adapters (Jellyseerr, n8n, qBittorrent, ChangeDetection)
├─ jobs/                # Scheduled tasks and cron helpers
├─ services/            # Domain services (database connector, change detection, icon helpers, etc.)
├─ sql/                 # Parameterized queries loaded by services/commands
├─ state/               # In-memory caches (e.g., search results)
├─ utils/               # Shared utilities like loggedFetch
└─ types/               # Shared TypeScript types
```

Additional resources:

- `docker-compose.yaml` – Runtime stack for bot + supporting services.
- `cron_job_instructions.md` – Guidance for scheduled tasks (plant reminders, watch updates, etc.).
- `policy.yml` – Default security policy template.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request for features, bug fixes, or documentation updates. Please run `npm run lint` and `npm run typecheck` before submitting your PR to keep CI happy. 💪

## License

This project is open source. Add your preferred license file (e.g., `LICENSE`) to formally declare the terms for contributors and users.

---

Made with ❤️, TypeScript, and a healthy respect for automation.
