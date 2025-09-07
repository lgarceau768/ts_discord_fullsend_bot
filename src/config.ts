import "dotenv/config";
import { z } from "zod";

/**
 * Shape of the expected environment variables. This is used for type
 * inference only; the actual validation is done by zod below.
 */
export interface ENV_SCHEMA {
    DISCORD_TOKEN: string;
    DISCORD_CLIENT_ID: string;
    DISCORD_GUILD_ID?: string;
    LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

    N8N_SEARCH_URL?: string;
    N8N_API_KEY?: string;

    JELLYSEERR_URL?: string;
    JELLYSEERR_API_KEY?: string;
    JELLYSEERR_SERIES_DEFAULT: "all" | "first" | "latest";
    JELLYSEERR_4K: "true" | "false";
    JELLYSEERR_AUTO_APPROVE: boolean;
    JELLYSEERR_AUTO_DOWNLOAD: boolean;
    JELLYSEERR_SEARCH_NOW: boolean;

    QBIT_URL?: string;
    QBIT_USERNAME?: string;
    QBIT_PASSWORD?: string;
}

/**
 * Validate and parse environment variables using zod. Any required variables
 * will cause the process to exit early with a helpful message when missing
 * or malformed. Optional variables default to undefined or sensible defaults.
 */
const EnvSchema = z
  .object({
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
    DISCORD_GUILD_ID: z.string().optional(),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    // n8n / Trakt
    N8N_SEARCH_URL: z.string().optional(),
    N8N_API_KEY: z.string().optional(),

    // Jellyseerr / YAMS
    JELLYSEERR_URL: z.string().optional(),
    JELLYSEERR_API_KEY: z.string().optional(),
    JELLYSEERR_SERIES_DEFAULT: z
      .enum(["all", "first", "latest"])
      .optional()
      .default("first"),
    JELLYSEERR_4K: z.enum(["true", "false"]).optional().default("false"),

    // qBittorrent
    QBIT_URL: z.string().optional(),
    QBIT_USERNAME: z.string().optional(),
    QBIT_PASSWORD: z.string().optional(),
  }).optional();

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env: ENV_SCHEMA = parsed.data as ENV_SCHEMA