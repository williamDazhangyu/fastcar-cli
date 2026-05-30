#!/usr/bin/env node
// @ts-check

"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");

/**
 * @param {string[]} argv
 * @returns {{ promptPath: string | null; resultPath: string | null }}
 */
function parseArgs(argv) {
  /** @type {{ promptPath: string | null; resultPath: string | null }} */
  const parsed = { promptPath: null, resultPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--prompt" && argv[index + 1]) {
      parsed.promptPath = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--prompt=")) {
      parsed.promptPath = arg.slice("--prompt=".length);
    } else if (arg === "--result" && argv[index + 1]) {
      parsed.resultPath = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--result=")) {
      parsed.resultPath = arg.slice("--result=".length);
    }
  }
  if (!parsed.resultPath && argv[0] && !argv[0].startsWith("--")) {
    parsed.resultPath = argv[0];
  }
  if (!parsed.promptPath && argv[1] && !argv[1].startsWith("--")) {
    parsed.promptPath = argv[1];
  }
  return parsed;
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripJsonFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * @param {unknown} response
 * @returns {string}
 */
function extractContent(response) {
  const data = response && typeof response === "object" ? /** @type {Record<string, any>} */ (response) : {};
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  if (choice && choice.message && typeof choice.message.content === "string") {
    return choice.message.content;
  }
  if (choice && typeof choice.text === "string") {
    return choice.text;
  }
  if (Array.isArray(data.output)) {
    const textParts = [];
    for (const item of data.output) {
      const content = item && Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (part && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
    }
    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }
  throw new Error("provider response did not contain text content");
}

/**
 * @param {string} baseUrl
 * @returns {string}
 */
function buildChatCompletionsUrl(baseUrl) {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

/**
 * @param {string} urlText
 * @param {Record<string, string>} headers
 * @param {unknown} payload
 * @returns {Promise<unknown>}
 */
function postJson(urlText, headers, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlText);
    const body = JSON.stringify(payload);
    const transport = url.protocol === "http:" ? http : https;
    const request = transport.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`provider returned HTTP ${response.statusCode}: ${text.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`provider returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function main() {
  const { promptPath, resultPath } = parseArgs(process.argv.slice(2));
  if (!promptPath || !resultPath) {
    throw new Error("Usage: auto-iterate-openai-worker --prompt <prompt> --result <result>");
  }
  const apiKey = process.env.AUTO_ITERATE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.AUTO_ITERATE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
  const model = process.env.AUTO_ITERATE_OPENAI_MODEL || process.env.OPENAI_MODEL;
  if (!apiKey || !baseUrl || !model) {
    throw new Error("Missing OPENAI-compatible config: require OPENAI_API_KEY, OPENAI_BASE_URL and OPENAI_MODEL");
  }

  const prompt = fs.readFileSync(promptPath, "utf8");
  const payload = {
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You are an auto-iterate worker.",
          "Return only a JSON object matching the result.json contract from the prompt.",
          "Do not wrap the JSON in Markdown.",
        ].join(" "),
      },
      { role: "user", content: prompt },
    ],
  };
  const response = await postJson(buildChatCompletionsUrl(baseUrl), {
    authorization: `Bearer ${apiKey}`,
  }, payload);
  const content = stripJsonFence(extractContent(response));
  const parsed = JSON.parse(content);
  fs.writeFileSync(resultPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
