/**
 * A tiny OpenAI-compatible model server for testing without API keys.
 *
 *   pnpm mock:ai                 listens on http://127.0.0.1:4010/v1
 *   PORT=4011 pnpm mock:ai
 *
 * Point the app at it (in .env.local, then rebuild):
 *   AI_BASE_URL=http://127.0.0.1:4010/v1  AI_API_KEY=mock  AI_MODEL=mock
 * The model id "mock-slow" waits 8 s before answering, to try demo mode:
 *   AI_MODEL=mock-slow AI_FALLBACK_MODEL=mock DEMO_MODE=true AI_SLOW_MS=3000
 *
 * It answers just enough like a real model to drive every flow: labels
 * (JSON), Sage replies by hint-ladder step with a notes search tool call,
 * Lens tool calls (overview, topics, quiz) and the Trace summary. The text is
 * canned; this is for checking plumbing and UI, not the prompts.
 */
import { createServer, type ServerResponse } from "node:http";

const port = Number(process.env.PORT ?? 4010);

type Msg = { role: string; content?: string | { type: string; text?: string }[] | null; tool_calls?: unknown[] };
const text = (m?: Msg) =>
  typeof m?.content === "string" ? m.content : (m?.content ?? []).map((p) => p.text ?? "").join("");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ids = 0;
const id = (p: string) => `${p}_${Date.now().toString(36)}_${ids++}`;

type Reply = { text?: string; calls?: { name: string; args: unknown }[] };

function labels(student: string) {
  const s = student.toLowerCase();
  const seek = /(give|tell|just|write|solve).*(answer|solution|essay|it)|just solve|final answer/.test(s);
  const pasted = student.length > 200 && /\b(q\d|determine|find|calculate|marks)\b/i.test(student);
  const attempt = /\b(i (got|tried|used|think)|my (answer|working))\b/.test(s);
  return {
    intent: seek ? "answer_seeking" : pasted ? "pasted_question" : "concept_question",
    attempted: attempt,
    sharesSolution: false,
    instructionOverride: /ignore (your|all) (instructions|rules)|pretend you are/.test(s),
    distress: /can'?t cope|so stressed|hopeless/.test(s) ? "low" : "none",
    topic: /polytropic/.test(s) ? "polytropic process work" : /entropy/.test(s) ? "entropy as disorder" : "first law",
  };
}

function sage(system: string, users: string[], toolResult: string | null, hasSearch: boolean): Reply {
  const level = Number(system.match(/Your step for THIS reply is (\d)/)?.[1] ?? 1);
  if (hasSearch && level >= 2 && !toolResult) {
    const all = users.join(" ").toLowerCase();
    const query = all.includes("polytropic") ? "polytropic process boundary work" : users[0].split(/\s+/).slice(0, 8).join(" ");
    return { calls: [{ name: "search_course_material", args: { query } }] };
  }
  const page = toolResult?.match(/"page"\s*:\s*(\d+)/)?.[1];
  const cite = page ? ` Page ${page} of the lecture notes walks through exactly this.` : "";
  switch (level) {
    case 1:
      return { text: "Let's work through this together. Before we start: what have you tried so far, and which part feels unclear?" };
    case 2:
      return {
        text: `I can't give you the final answer for graded work, but I can make the next step easier.\n\nThe idea that applies here is a **polytropic process**, $PV^n = C$. The boundary work is $W_b = \\dfrac{mR(T_2 - T_1)}{1 - n}$.${cite}\n\nWhich quantity can you find first?`,
      };
    case 3:
      return {
        text: `I know you're short on time. I won't hand over the answer, but let's break it into steps:\n\n1. Find $T_2$ from $T_2/T_1 = (P_2/P_1)^{(n-1)/n}$.\n2. Use it in $W_b = mR(T_2 - T_1)/(1 - n)$.\n3. Get $\\Delta U = m c_v (T_2 - T_1)$, then $Q$ from the first law.${cite}\n\nHave a go at step 1 and share what you get.`,
      };
    case 4:
      return { text: "Here's a similar problem with different numbers: 2 kg of nitrogen expands with n = 1.2 from 600 kPa, 400 K to 150 kPa, so T₂ = 317.5 K and W = 245 kJ. Now try the same steps on yours." };
    default:
      return { text: "Your setup is right up to the second line. Look again at the sign of (1 − n): what does it tell you about the work?" };
  }
}

const quiz = {
  topic: "polytropic process work",
  questions: [1, 2, 3, 4, 5].map((n) => ({
    question: `Question ${n}: for a polytropic process with n = 1.${n}, which expression gives the boundary work?`,
    options: ["mR(T2 − T1)/(1 − n)", "P(V2 − V1)", "mRT ln(V2/V1)", "0"],
    answer_index: 0,
    explanation: "Integrating P dV with PV^n = C gives mR(T2 − T1)/(1 − n) for n ≠ 1.",
  })),
};

function lens(users: string[], toolResults: string[]): Reply {
  const last = users.at(-1)?.toLowerCase() ?? "";
  if (/quiz/.test(last) && !toolResults.some((r) => r.includes('"questions"'))) {
    return { calls: [{ name: "generate_quiz", args: quiz }] };
  }
  if (!toolResults.length) {
    return {
      calls: [
        { name: "get_topic_struggles", args: { days: 28, limit: 5 } },
        { name: "list_flags", args: { status: "open", limit: 10 } },
      ],
    };
  }
  if (/quiz/.test(last)) return { text: "Here's a 5-question revision quiz on **polytropic process work**. Review it before sharing." };
  const topics = [...toolResults.join("\n").matchAll(/"topic"\s*:\s*"([^"]+)"[^}]*?"messages"\s*:\s*(\d+)/g)].slice(0, 5);
  const names = [...new Set([...toolResults.join("\n").matchAll(/"student(?:Name)?"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))].slice(0, 4);
  const rows = topics.map((t) => `| ${t[1]} | ${t[2]} |`).join("\n");
  return {
    text: `Your class is asking about these concepts most:\n\n| Topic | Messages |\n| --- | --- |\n${rows || "| (no topics yet) | 0 |"}\n\n${names.length ? `Students with open flags who may need a check-in: ${names.join(", ")}.` : "No open flags right now."}`,
  };
}

function trace(prompt: string) {
  const f = JSON.parse(prompt.match(/Facts \(JSON\):\n([\s\S]*?)\n\nReturn/)?.[1] ?? "{}");
  const paste = f.pastes?.[0];
  const pastes = paste
    ? ` ${f.pastes.length === 1 ? "One paste" : `${f.pastes.length} pastes; the first`} at ${paste.time} added ${paste.characters} characters, about ${paste.about_share_of_final_length} of the final length.`
    : " No pastes were recorded.";
  return {
    summary: `Written over ${f.sessions} ${f.sessions === 1 ? "session" : "sessions"}, ${f.active_minutes} minutes active.${pastes} Pasted text makes up ${f.pasted_text_share_of_final_text} of the final text.`,
  };
}

async function send(res: ServerResponse, body: Record<string, unknown>, reply: Reply, stream: boolean, model: string) {
  const created = Math.floor(Date.now() / 1000);
  const calls = (reply.calls ?? []).map((c, index) => ({
    index,
    id: id("call"),
    type: "function",
    function: { name: c.name, arguments: JSON.stringify(c.args) },
  }));
  const finish = calls.length ? "tool_calls" : "stop";
  const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
  if (!stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: id("cmpl"), object: "chat.completion", created, model,
      choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: reply.text ?? null, tool_calls: calls.length ? calls : undefined } }],
      usage,
    }));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  const chunk = (delta: object, finish_reason: string | null = null) =>
    res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  chunk({ role: "assistant", content: "" });
  if (calls.length) chunk({ tool_calls: calls });
  for (const word of (reply.text ?? "").split(/(?<= )/)) {
    chunk({ content: word });
    await sleep(15);
  }
  chunk({}, finish);
  res.write(`data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created, model, choices: [], usage })}\n\n`);
  res.end("data: [DONE]\n\n");
  void body;
}

createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  const body = JSON.parse(raw);
  const model = String(body.model);
  if (model.includes("slow")) await sleep(8000);
  const messages: Msg[] = body.messages ?? [];
  const system = messages.filter((m) => m.role === "system").map(text).join("\n");
  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
  const users = messages.filter((m) => m.role === "user").map(text);
  const toolResults = messages.slice(lastUserIdx + 1).filter((m) => m.role === "tool").map(text);
  const tools: string[] = (body.tools ?? []).map((t: { function: { name: string } }) => t.function.name);

  let reply: Reply;
  if (body.response_format) {
    const out = /label/i.test(system) ? labels(users.at(-1)?.match(/"""\n([\s\S]*)\n"""/)?.[1] ?? users.at(-1) ?? "") : trace(users.at(-1) ?? "");
    reply = { text: JSON.stringify(out) };
  } else if (tools.some((t) => t.startsWith("get_"))) {
    reply = lens(users, toolResults);
  } else {
    reply = sage(system, users, toolResults.at(-1) ?? null, tools.includes("search_course_material"));
  }
  console.log(`${new Date().toISOString().slice(11, 19)} ${model} ${body.response_format ? "json" : tools.length ? `tools(${tools.length})` : "text"} → ${reply.calls ? reply.calls.map((c) => c.name).join(",") : (reply.text ?? "").slice(0, 60).replace(/\n/g, " ")}`);
  await send(res, body, reply, Boolean(body.stream), model);
}).listen(port, "127.0.0.1", () => console.log(`mock AI on http://127.0.0.1:${port}/v1`));
