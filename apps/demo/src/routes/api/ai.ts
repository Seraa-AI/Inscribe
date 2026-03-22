import { streamText, convertToModelMessages, tool, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { createFileRoute } from "@tanstack/react-router";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export const Route = createFileRoute("/api/ai")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages, context } = (await request.json()) as {
          messages: UIMessage[];
          context?: string;
        };

        const systemPrompt = [
          "You are a writing assistant embedded in a document editor.",
          "",
          "## Tool usage rules (follow strictly)",
          "- Whenever you draft, write, continue, or generate any document content → call `insert_text` with that content.",
          "- Whenever the user asks you to rewrite, rephrase, fix, or improve SELECTED text → call `replace_selection`.",
          "- You MAY include a short text message (1-2 sentences) explaining what you are doing.",
          "- NEVER write the suggested content only in a text reply — always put it in the tool call.",
          "- If the user is asking a general question (not requesting new content), reply with text only.",
          ...(context ? ["", "## Current document context", "", context] : []),
        ].join("\n");

        const result = streamText({
          model: anthropic("claude-sonnet-4-6"),
          system: systemPrompt,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(5),
          tools: {
            insert_text: tool({
              description:
                "Insert text into the document at the current cursor position. Use this to add new content, continue a passage, or write something for the user.",
              inputSchema: z.object({
                text: z.string().describe("The text to insert into the document"),
              }),
              execute: async ({ text }) => ({ text }),
            }),
            replace_selection: tool({
              description:
                "Replace the currently selected text with new text. Use this when the user asks to rewrite, rephrase, or fix selected content.",
              inputSchema: z.object({
                text: z.string().describe("The replacement text"),
              }),
              execute: async ({ text }) => ({ text }),
            }),
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
