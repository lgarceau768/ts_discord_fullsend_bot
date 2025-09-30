import { logger } from "../logger.js";
function extractUrl(input) {
    if (typeof input === "string")
        return input;
    if (input instanceof URL)
        return input.toString();
    if (typeof Request !== "undefined" && input instanceof Request)
        return input.url;
    return "unknown";
}
function extractMethod(input, init) {
    if (init?.method)
        return init.method;
    if (typeof Request !== "undefined" && input instanceof Request)
        return input.method;
    return "GET";
}
function bodySummary(init) {
    if (!init || init.body == null)
        return undefined;
    if (typeof init.body === "string")
        return `string(${init.body.length})`;
    if (init.body instanceof URLSearchParams)
        return "URLSearchParams";
    if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body))
        return "ArrayBuffer";
    return "present";
}
export async function loggedFetch(input, init) {
    const url = extractUrl(input);
    const method = extractMethod(input, init);
    const logMeta = { method, url };
    const body = bodySummary(init);
    if (body)
        logMeta.body = body;
    logger.info(logMeta, "fetch request");
    const start = Date.now();
    try {
        const res = await fetch(input, init);
        const durationMs = Date.now() - start;
        logger.info({ ...logMeta, status: res.status, durationMs }, "fetch response");
        return res;
    }
    catch (error) {
        const durationMs = Date.now() - start;
        logger.error({ ...logMeta, durationMs }, "fetch failed");
        throw error;
    }
}
