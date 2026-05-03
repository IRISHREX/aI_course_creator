// Thin proxy to Gemini so the browser never sees the API key.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, AuthedRequest } from "../auth.js";
import { env } from "../env.js";
import { getUserAiKeys, markUserAiKeyLimited } from "../aiKeys.js";

export const aiRouter = Router();

const ChatBody = z.object({
  model: z.string().default("google/gemini-2.5-flash"),
  messages: z.array(z.object({ role: z.string(), content: z.any() })),
  tools: z.any().optional(),
  tool_choice: z.any().optional(),
  temperature: z.number().optional(),
});

function toGeminiModel(model: string): string {
  return model.replace(/^google\//, "") || "gemini-2.5-flash";
}

function toGeminiText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) return String((part as { text: unknown }).text ?? "");
      return JSON.stringify(part);
    }).join("\n");
  }
  return typeof content === "undefined" ? "" : JSON.stringify(content);
}

function toGeminiTools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  const declarations = tools
    .filter((tool: any) => tool?.type === "function" && tool.function?.name)
    .map((tool: any) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined;
}

function toGeminiToolConfig(toolChoice: unknown) {
  const name = (toolChoice as any)?.function?.name;
  if (!name) return undefined;
  return {
    functionCallingConfig: {
      mode: "ANY",
      allowedFunctionNames: [name],
    },
  };
}

function isSchemaConstraintError(message: string) {
  return /schema produces a constraint|too many states|function.*declaration|response schema|parameters/i.test(message);
}

function isKeyOrQuotaError(status: number, message: string) {
  if (status === 429 || status === 401 || status === 403) return true;
  return /api key|quota|rate limit|permission denied|exceeded/i.test(message);
}

aiRouter.post("/chat", requireAuth, requireRole("admin", "super_admin"), async (req: AuthedRequest, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const userKeys = await getUserAiKeys(req.user!.id);
  const apiKeys = [
    ...userKeys,
    ...(env.GOOGLE_AI_API_KEY ? [{ id: "env", provider: "google", keyPreview: "env", apiKey: env.GOOGLE_AI_API_KEY }] : []),
  ];
  if (!apiKeys.length) {
    return res.status(402).json({
      code: "AI_KEY_REQUIRED",
      error: "AI API key required. Add your Gemini API key to continue generation.",
    });
  }

  const systemText = parsed.data.messages
    .filter((message) => message.role === "system")
    .map((message) => toGeminiText(message.content))
    .filter(Boolean)
    .join("\n\n");
  const contents = parsed.data.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: toGeminiText(message.content) }],
    }));

  const model = toGeminiModel(parsed.data.model);
  const geminiTools = toGeminiTools(parsed.data.tools);
  const toolConfig = toGeminiToolConfig(parsed.data.tool_choice);
  const requestBody = JSON.stringify({
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    ...(geminiTools ? { tools: geminiTools } : {}),
    ...(toolConfig ? { toolConfig } : {}),
    generationConfig: {
      ...(typeof parsed.data.temperature === "number" ? { temperature: parsed.data.temperature } : {}),
    },
  });

  let data: any = null;
  let lastKeyError = "";
  for (const apiKey of apiKeys) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    data = await r.json().catch(() => null);
    if (r.ok) break;

    const message = data?.error?.message || data?.error || "Gemini request failed";
    if (isSchemaConstraintError(String(message))) {
      return res.status(400).json({
        code: "AI_REQUEST_INVALID",
        error: "AI request schema is too complex. Simplify the lesson output schema and try again.",
        detail: message,
      });
    }
    if (isKeyOrQuotaError(r.status, String(message))) {
      lastKeyError = String(message);
      if (apiKey.id !== "env") await markUserAiKeyLimited(apiKey.id, String(message));
      continue;
    }
    return res.status(r.status).json({
      code: "AI_REQUEST_FAILED",
      error: "Gemini request failed.",
      detail: message,
    });
  }

  if (!data?.candidates) {
    return res.status(429).json({
      code: "AI_KEY_LIMIT",
      error: "All saved Gemini API keys are limited or invalid. Add another API key to continue.",
      detail: lastKeyError || "No active Gemini API key succeeded.",
    });
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const functionCalls = parts
    .map((part: { functionCall?: { name?: string; args?: unknown } }) => part.functionCall)
    .filter((call: { name?: string; args?: unknown } | undefined) => call?.name);
  const content = parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("") ?? "";

  res.json({
    id: data?.responseId ?? `gemini-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content,
        ...(functionCalls.length ? {
          tool_calls: functionCalls.map((call: { name?: string; args?: unknown }, index: number) => ({
            id: `call_${Date.now()}_${index}`,
            type: "function",
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args || {}),
            },
          })),
        } : {}),
      },
      finish_reason: data?.candidates?.[0]?.finishReason?.toLowerCase?.() ?? "stop",
    }],
    usage: data?.usageMetadata ? {
      prompt_tokens: data.usageMetadata.promptTokenCount,
      completion_tokens: data.usageMetadata.candidatesTokenCount,
      total_tokens: data.usageMetadata.totalTokenCount,
    } : undefined,
  });
});
