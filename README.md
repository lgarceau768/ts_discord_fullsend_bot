# ts_discord_fullsend_bot

This Discord bot template provides a solid starting point for building out
features on top of the Discord.js library. It comes with TypeScript,
ESLint/Prettier, environment variable validation via Zod, and a command/event
architecture. The following functionality is included out of the box:

- `/ping`: Test command that replies with the bot's latency.
- `/search`: Search for movies or TV shows via a user-provided n8n workflow
  (expected to integrate with Trakt). Returns up to five results as
  nicely formatted embeds. Each result includes a **Request** button which
  triggers a request against your Jellyseerr instance to queue the title for
  download. TV show requests honour the `JELLYSEERR_SERIES_DEFAULT`
  preference when choosing which seasons to download.
- `/downloads`: Query your qBittorrent WebUI API for currently downloading
  torrents and display their progress, speed and ETA. Useful for keeping tabs
  on what your YAMS stack is doing.

## Configuration

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` – obtained from the Discord Developer Portal.
- `DISCORD_GUILD_ID` – optional; set for rapid dev command registration.
- `N8N_SEARCH_URL` – your n8n webhook URL which should accept a JSON body
  `{ "query": string, "type": "movie"|"show"|"both" }` and return
  `{ "results": [] }` as documented in `src/integrations/n8n.ts`.
- `JELLYSEERR_URL`, `JELLYSEERR_API_KEY` – API endpoint and key for your
  Jellyseerr instance.
- `JELLYSEERR_SERIES_DEFAULT` – determines which seasons to request when
  clicking **Request** on a TV show search result (`all`, `first`, or
  `latest`).
- `JELLYSEERR_4K` – set to `true` to flag requests for 4K content.
- `QBIT_URL`, `QBIT_USERNAME`, `QBIT_PASSWORD` – connection details for your
  qBittorrent instance. Credentials are optional if your qBittorrent WebUI
  doesn't require authentication.

## Development

Install dependencies and run the bot in watch mode:

```bash
npm install
npm run register:dev  # register slash commands to your dev guild
npm run dev          # runs the bot with hot reload
```

For production deployments, build and run:

```bash
npm run build
npm start
```

Or use Docker:

```bash
docker-compose up --build
```

## Extending

Add new slash commands by creating a file in `src/commands/` that exports a
`SlashCommand` and then import it in `src/index.ts` and
`src/registerCommands.ts`. Add event listeners by adding a file in
`src/events/` and wiring it in `src/index.ts`.