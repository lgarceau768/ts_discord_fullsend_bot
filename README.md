# ts_discord_fullsend_bot

A clean, batteries-included TypeScript template for a Discord bot using `discord.js` v14.

## Features
- Slash commands (example: `/ping`)
- Command & event architecture
- Hot reload dev loop with `tsx`
- Env validation via Zod
- ESLint + Prettier
- Simple command registrar (guild/global)
- CI (GitHub Actions) + optional Docker

## Quickstart

```bash
# 1) install deps
npm install

# 2) configure environment
cp .env.example .env
# Fill DISCORD_TOKEN, DISCORD_CLIENT_ID (and DISCORD_GUILD_ID for dev registration)

# 3) register commands (fast in dev guild)
npm run register:dev

# 4) run with hot reload
npm run dev
```

### Register globally (production)
```bash
npm run register:global
# Note: global commands can take up to ~1 hour to propagate.
```

## Getting credentials
1. Discord Developer Portal → Application → **Bot** → Reset Token → `DISCORD_TOKEN`
2. Application → **OAuth2** → Client information → `DISCORD_CLIENT_ID`
3. For dev registration, set `DISCORD_GUILD_ID` to your test server's ID
4. Invite the bot with the scopes `bot` and `applications.commands`

## Scripts
- `npm run dev` – start bot with hot reload
- `npm run build` – compile TypeScript to `dist/`
- `npm run start` – run the compiled bot
- `npm run register:dev` – register slash commands to a dev guild
- `npm run register:global` – register commands globally

## Docker (optional)
```bash
docker compose up --build -d
```
