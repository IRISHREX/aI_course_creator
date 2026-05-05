// Thin proxy to Gemini, OpenAI, and Groq so the browser never sees the API key.
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
  provider: z.enum(["google", "openai", "groq"]).optional(),
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

function toOpenAITools(tools: unknown) {
  if (!Array.isArray(tools)) return undefined;
  const declarations = tools
    .filter((tool: any) => tool?.type === "function" && tool.function?.name)
    .map((tool: any) => ({
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  return declarations.length ? declarations : undefined;
}

function toOpenAIToolChoice(toolChoice: unknown) {
  const name = (toolChoice as any)?.function?.name;
  if (!name) return undefined;
  return { type: "function", function: { name } };
}

aiRouter.post("/chat", requireAuth, requireRole("admin", "super_admin"), async (req: AuthedRequest, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  const userKeys = await getUserAiKeys(req.user!.id);
  const requestedProvider = parsed.data.provider || "google";
  
  // Filter keys by provider, with fallback to env key if provider is google
  let apiKeys = userKeys.filter(k => k.provider === requestedProvider);
  if (requestedProvider === "google" && apiKeys.length === 0 && env.GOOGLE_AI_API_KEY) {
    apiKeys = [{ id: "env", provider: "google", keyPreview: "env", apiKey: env.GOOGLE_AI_API_KEY }];
  }
  
  if (!apiKeys.length) {
    return res.status(402).json({
      code: "AI_KEY_REQUIRED",
      error: `No valid ${requestedProvider} API key found. Please add your ${requestedProvider.toUpperCase()} API key to continue.`,
    });
  }

  // Prepare messages in OpenAI format (compatible with all providers)
  const openaiMessages = parsed.data.messages.map((message) => ({
    role: message.role,
    content: toGeminiText(message.content),
  }));

  const openaiTools = toOpenAITools(parsed.data.tools);
  const openaiToolChoice = toOpenAIToolChoice(parsed.data.tool_choice);

  let data: any = null;
  let lastKeyError = "";
  
  for (const apiKey of apiKeys) {
    let r: Response;
    
    if (requestedProvider === "openai") {
      // OpenAI API call
      const requestBody = {
        model: "gpt-4o",
        messages: openaiMessages,
        temperature: typeof parsed.data.temperature === "number" ? parsed.data.temperature : undefined,
        ...(openaiTools ? { tools: openaiTools, tool_choice: openaiToolChoice || "auto" } : {}),
      };
      
      r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } else if (requestedProvider === "groq") {
      // Groq API call
      const requestBody = {
        model: "mixtral-8x7b-32768",
        messages: openaiMessages,
        temperature: typeof parsed.data.temperature === "number" ? parsed.data.temperature : undefined,
        ...(openaiTools ? { tools: openaiTools, tool_choice: openaiToolChoice || "auto" } : {}),
      };
      
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } else {
      // Gemini API call
      const systemText = parsed.data.messages
        .filter((message) => message.role === "system")
        .map((message) => toGeminiText(message.content))
        .filter(Boolean)
        .join("\n\n");
      const contents = openaiMessages
        .filter((m) => m.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
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

      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
    }

    data = await r.json().catch(() => null);
    if (r.ok) break;

    const message = data?.error?.message || data?.error || `${requestedProvider} request failed`;
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
      error: `${requestedProvider} request failed.`,
      detail: message,
    });
  }

  // Parse response based on provider
  let content = "";
  let toolCalls: any[] = [];
  let usage: any = null;

  if (requestedProvider === "openai" || requestedProvider === "groq") {
    // OpenAI/Groq format
    if (!data?.choices?.[0]) {
      return res.status(429).json({
        code: "AI_KEY_LIMIT",
        error: `All saved ${requestedProvider} API keys are limited or invalid. Add another API key to continue.`,
        detail: lastKeyError || `No active ${requestedProvider} API key succeeded.`,
      });
    }
    
    const message = data.choices[0].message;
    content = message.content || "";
    
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      toolCalls = message.tool_calls.map((call: any, index: number) => ({
        id: `call_${Date.now()}_${index}`,
        type: "function",
        function: {
          name: call.function?.name,
          arguments: call.function?.arguments || "{}",
        },
      }));
    }
    
    usage = data.usage;
  } else {
    // Gemini format
    if (!data?.candidates) {
      return res.status(429).json({
        code: "AI_KEY_LIMIT",
        error: `All saved ${requestedProvider} API keys are limited or invalid. Add another API key to continue.`,
        detail: lastKeyError || `No active ${requestedProvider} API key succeeded.`,
      });
    }

    const parts = data.candidates[0]?.content?.parts || [];
    const functionCallParts = parts
      .map((part: { functionCall?: { name?: string; args?: unknown } }) => part.functionCall)
      .filter((call: { name?: string; args?: unknown } | undefined) => call?.name);
    
    toolCalls = functionCallParts.map((call: { name?: string; args?: unknown }, index: number) => ({
      id: `call_${Date.now()}_${index}`,
      type: "function",
      function: {
        name: call.name,
        arguments: JSON.stringify(call.args || {}),
      },
    }));
    
    content = parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("") ?? "";
    
    usage = data.usageMetadata ? {
      prompt_tokens: data.usageMetadata.promptTokenCount,
      completion_tokens: data.usageMetadata.candidatesTokenCount,
      total_tokens: data.usageMetadata.totalTokenCount,
    } : undefined;
  }

  res.json({
    id: data?.id ?? data?.responseId ?? `${requestedProvider}-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedProvider,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: data?.candidates?.[0]?.finishReason?.toLowerCase?.() ?? data?.choices?.[0]?.finish_reason ?? "stop",
    }],
    ...(usage ? { usage } : {}),
  });
});
