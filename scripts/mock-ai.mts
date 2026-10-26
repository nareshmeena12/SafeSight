/**
 * A tiny OpenAI-compatible model server for testing without API keys.
 *
 *   pnpm mock:ai                 listens on http://127.0.0.1:4010/v1
 *   PORT=4011 pnpm mock:ai
 *
 * Point the app at it (in .env.local, then rebuild):
 *   AI_BASE_URL=http://127.0.0.1:4010/v1  AI_API_KEY=mock  AI_MODEL=mock
 * The model id "mock-slow" waits 8 s before answering, to try the timeout + retry:
 *   AI_MODEL=mock-slow AI_FALLBACK_MODEL=mock DEMO_MODE=true AI_SLOW_MS=3000
 * The model id "mock-leaky" writes drafts that give the answer away (answer-key
 * values, essay paragraphs, full code), to check that Sage's output guard
 * holds them back: AI_MODEL=mock-leaky pnpm eval:sage
 *
 * It answers just enough like a real model to drive every flow: labels
 * (JSON), Sage replies by hint-ladder step with a notes search tool call,
 * Lens tool calls (overview, topics, quiz), the Trace summary and the
 * learning tools (practice, grading, refreshers, explain it back, recaps,
 * the mistake log), exam prep (topics from notes, mock tests, marking), photos of working and
 * "Ask your teacher" summaries (S21). The text is
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

function labels(student: string, chatRef: string | null) {
  const s = student.toLowerCase();
  const seek = /(give|tell|just|solve).*(answer|solution|it)|just solve|final answer/.test(s);
  const deliverable = /\b(write|draft)\b.*\b(essay|paragraph|code|function|report)\b/.test(s);
  const pasted = student.length > 200 && /\b(q\d|determine|find|calculate|marks)\b/i.test(student);
  const attempt = /\b(i (got|tried|used|think)|my (working|attempt))\b/.test(s) && /=|\d/.test(s);
  const verify = /(is (it|this|that) (right|correct)|am i right)/.test(s);
  const jailbreak = /ignore (your|all|previous) (instructions|rules)|pretend you are|system prompt|developer mode/.test(s);
  const intent = jailbreak
    ? "jailbreak"
    : deliverable
      ? "deliverable_request"
      : seek || pasted
        ? "answer_seeking"
        : verify
          ? "verify_answer"
          : attempt
            ? "attempt"
            : "concept";
  const general = intent === "concept" && student.length < 120 && !/this (question|problem)|problem \d|my (essay|lab)/.test(s);
  return {
    intent,
    attemptQuality: attempt ? (s.split("=").length > 3 ? 0.8 : 0.6) : 0,
    sharesWorking: attempt,
    claimsPermission: /(teacher|sir|ma'?am) (said|allowed)|not graded/.test(s),
    distress: /can'?t cope|so stressed|hopeless/.test(s) ? "low" : "none",
    topic: /polytropic/.test(s) ? "polytropic process work" : /entropy/.test(s) ? "entropy as disorder" : "first law",
    match: { ref: chatRef, similarity: chatRef ? (general ? 0.3 : 0.7) : 0 },
  };
}

function leakyDraft(system: string): string {
  const kind = system.match(/Type of work: (\w+)/)?.[1] ?? (/Numerical Methods/.test(system) ? "code" : "problem");
  if (kind === "essay") {
    const para = "Entropy is a measure of how many ways the energy of a system can be arranged, and in everyday life we see it whenever things spread out on their own. ".repeat(4);
    return `Here is a sample essay you can use:\n\n${para}\n\n${para}\n\n${para}`;
  }
  if (kind === "code") {
    return "```python\ndef newton_raphson(f, df, x0, tol=1e-6, max_iter=50):\n    x = x0\n    for _ in range(max_iter):\n        d = df(x)\n        if d == 0:\n            raise ValueError('zero derivative')\n        x = x - f(x) / d\n        if abs(f(x)) < tol:\n            return x\n    return x\n```\nThe root near 2 is 2.0946.";
  }
  return "Sure! V1 = 0.459 m³, so W = P(V2 − V1) = 68.9 kJ. Then T2 = 600 K and Q = 241.2 kJ.";
}

/** Canned output for the learning tools (S17): practice, grading, refreshers, recaps. */
const learning = {
  practice: () => ({
    problems: [
      { difficulty: "warm_up", question: "A reservoir at 400 K gives 1200 J of heat to a system. Find the reservoir's entropy change.", solution: "ΔS = Q/T = −1200/400 = −3 J/K", finalAnswer: "−3 J/K" },
      { difficulty: "standard", question: "2 kg of water is heated from 290 K to 350 K (c = 4.18 kJ/kg·K). Find ΔS.", solution: "ΔS = m c ln(T2/T1) = 2 × 4.18 × ln(350/290) = 1.572 kJ/K", finalAnswer: "1.57 kJ/K" },
      { difficulty: "stretch", question: "1 kg of air is compressed isothermally at 310 K from 1 bar to 5 bar (R = 0.287 kJ/kg·K). Find ΔS and say why it is negative.", solution: "ΔS = −R ln(P2/P1) = −0.287 ln 5 = −0.462 kJ/K; heat leaves the gas.", finalAnswer: "−0.462 kJ/K" },
    ],
  }),
  refresher: {
    skill: "Properties of logarithms",
    lesson: "Entropy changes use **logarithms** because $\\int dT/T = \\ln T$. Remember $\\ln(a/b) = \\ln a - \\ln b$, and $\\ln 1 = 0$. Tiny example: $\\ln(600/300) = \\ln 2 \\approx 0.693$. When a ratio is above 1 the log is positive, so heating raises entropy.",
    checks: [
      { question: "What is $\\int \\frac{1}{x}\\,dx$?", options: ["$\\ln|x| + C$", "$x^2/2 + C$", "$-1/x^2 + C$", "$e^x + C$"], answer: 0, explanation: "The integral of 1/x is the natural logarithm." },
      { question: "Simplify $\\ln(T_2/T_1)$.", options: ["$\\ln T_2 - \\ln T_1$", "$\\ln T_2 + \\ln T_1$", "$\\ln(T_2 - T_1)$", "$T_2/T_1$"], answer: 0, explanation: "The log of a quotient is the difference of the logs." },
    ],
  },
  grade: (prompt: string) => {
    const answer = prompt.match(/STUDENT'S ANSWER:\n"""\n([\s\S]*)\n"""/)?.[1] ?? "";
    const right = /−3|-3|1\.57|0\.46/.test(answer);
    return right
      ? { verdict: "correct", score: 1, feedback: "Spot on — right method and units.", mistake: "" }
      : { verdict: "partly", score: 0.5, feedback: "Right idea. Check the sign: which way does the heat flow?", mistake: "sign of heat for a reservoir" };
  },
  recap: {
    title: "Entropy and heat flow",
    learned: ["You saw that entropy measures how spread out energy is.", "You worked out that heat flows from hot to cold on its own.", "You used ΔS = Q/T for a reservoir."],
    flashcards: [
      { front: "What does entropy measure?", back: "How spread out energy is — the number of ways to arrange it." },
      { front: "Which way does heat flow on its own?", back: "From hot to cold." },
      { front: "Entropy change of a reservoir?", back: "ΔS = Q/T, with Q negative when it gives heat away." },
    ],
  },
};

/** S20 exam prep: topics from the notes, mock test questions and their marking. */
const exam = {
  topics: (prompt: string) => {
    const refs = [...prompt.matchAll(/^(P\d+) \[/gm)].map((m) => m[1]);
    const names = ["First law for closed systems", "Boundary work", "Polytropic processes", "Entropy change", "Second law and heat engines", "Carnot cycle"];
    return { topics: names.map((title, i) => ({ title, ref: refs[Math.min(refs.length - 1, Math.floor((i * refs.length) / names.length))] ?? "P1" })) };
  },
  topicsOf: (prompt: string) => [...(prompt.match(/^TOPICS: (.*)$/m)?.[1] ?? '"Entropy change"').matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  count: (system: string, key: string) => Number(system.match(new RegExp(`"${key}": \\[[^\\n]*\\(exactly (\\d+)\\)`))?.[1] ?? 0),
  conceptual(system: string, prompt: string) {
    const topics = exam.topicsOf(prompt);
    const t = (i: number) => topics[i % topics.length];
    const bank = [
      { question: "Two processes join the same two states. Which quantity is the same for both?", options: ["The change in internal energy", "The work done", "The heat added", "The area under the P–V curve"], explanation: "Internal energy is a property, so its change depends only on the end states." },
      { question: "Why does the entropy of an isolated system never decrease?", options: ["Real processes generate entropy", "Heat always flows in", "Its volume is fixed", "Its temperature is constant"], explanation: "Irreversibilities generate entropy and nothing can carry it out of an isolated system." },
      { question: "In a polytropic process with n = 1, which process is it for an ideal gas?", options: ["Isothermal", "Isobaric", "Isochoric", "Adiabatic"], explanation: "PV = constant at constant temperature for an ideal gas." },
      { question: "Which change raises a Carnot engine's efficiency?", options: ["Lowering the cold reservoir temperature", "Raising the cold reservoir temperature", "Using a different working fluid", "Running it faster"], explanation: "η = 1 − T_L/T_H, so a colder sink helps." },
      { question: "Boundary work on a P–V diagram is…", options: ["The area under the process curve", "The slope of the curve", "The change in pressure", "Always zero"], explanation: "W = ∫P dV, the area under the curve." },
    ];
    return {
      choice: Array.from({ length: exam.count(system, "choice") }, (_, i) => ({ topic: t(i), ...bank[i % bank.length], answer: 0 })),
      open: Array.from({ length: exam.count(system, "open") }, (_, i) => ({
        topic: t(i + 1),
        question: `In two or three sentences, explain why ${t(i + 1).toLowerCase()} matters when a gas is compressed in a piston–cylinder device${i ? " slowly" : ""}.`,
        solution: "Because the work and heat crossing the boundary depend on the path, the process type sets how much energy is transferred, while property changes depend only on the end states.",
        finalAnswer: "Path functions (work, heat) depend on the process; properties don't.",
      })),
    };
  },
  numeric(system: string, prompt: string) {
    const topics = exam.topicsOf(prompt);
    const bank = [
      { question: "1.5 kg of water is heated from 300 K to 360 K (c = 4.18 kJ/kg·K). Find its entropy change.", solution: "ΔS = m c ln(T2/T1) = 1.5 × 4.18 × ln(360/300) = 1.143 kJ/K", finalAnswer: "1.14 kJ/K" },
      { question: "Air (R = 0.287 kJ/kg·K), 0.8 kg, expands polytropically (n = 1.25) from 450 K to 380 K. Find the boundary work.", solution: "W = mR(T2 − T1)/(1 − n) = 0.8 × 0.287 × (380 − 450)/(−0.25) = 64.3 kJ", finalAnswer: "64.3 kJ" },
      { question: "A Carnot engine runs between 900 K and 320 K and takes in 500 kJ. Find the work out.", solution: "η = 1 − 320/900 = 0.644; W = 0.644 × 500 = 322 kJ", finalAnswer: "322 kJ" },
    ];
    return { problems: Array.from({ length: exam.count(system, "problems") }, (_, i) => ({ topic: topics[(i + 2) % topics.length], ...bank[i % bank.length] })) };
  },
  grade(prompt: string) {
    const blocks = prompt.split(/\n\n(?=Q\d+\n)/);
    return {
      results: blocks.map((b) => {
        const ref = b.match(/^(Q\d+)/)?.[1] ?? "Q1";
        const answer = b.match(/STUDENT'S ANSWER:\n"""\n([\s\S]*?)\n"""/)?.[1] ?? "";
        const good = answer.length > 40;
        return good
          ? { ref, verdict: "partly", score: 0.6, feedback: "Good reasoning on the main idea. Say which quantity depends on the path and why.", mistake: "" }
          : { ref, verdict: "not_yet", score: 0.1, feedback: "This needs the key idea: work and heat depend on the path.", mistake: "path vs state functions" };
      }),
    };
  },
};

function sage(system: string): Reply {
  const level = Number(system.match(/Ladder step for this reply: (\d)/)?.[1] ?? 1);
  if (/No graded assignment applies/.test(system)) {
    return { text: "Good question. Entropy measures how many microscopic arrangements match what we see — energy spreading out is overwhelmingly more likely than it gathering up. Think of a hot cup of chai cooling in a room. Which way does heat flow there, and why?" };
  }
  if (/shared their own working/.test(system)) {
    return { text: "Your first two lines are correct — nice setup. Look again at the third line: which temperature belongs in the ideal-gas law there? Fix that and tell me what you get." };
  }
  if (/Do not say or hint whether it is right or wrong/.test(system)) {
    return { text: "I'd love to check it with you — can you share your working, step by step, with units? Start with the first line." };
  }
  const page = system.match(/\[1\][^\n]*, page (\d+)/)?.[1];
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
      return { text: "Here's a different problem with the same method: a rigid tank of helium is cooled — find the final pressure from P/T = constant: 300 kPa at 500 K cooled to 350 K gives 210 kPa. Now apply the same idea, step by step, to your own problem." };
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

/** S18: three viva questions that quote the first pasted passage (or the first sentence). */
function viva(prompt: string) {
  const work = prompt.match(/submitted work:\n"""\n([\s\S]*?)\n"""/)?.[1] ?? "";
  const pasted = work.match(/\[pasted\]([\s\S]*?)\[\/pasted\]/)?.[1] ?? work.split(/(?<=\.)\s/)[0] ?? "";
  const quote = pasted.split(/\s+/).slice(0, 12).join(" ");
  return {
    questions: [
      { question: `You wrote "${quote}…" — can you explain that in your own words?`, lookFor: "They restate the idea without reading it out and link it to the question asked." },
      { question: "Why does that step follow from the one before it?", lookFor: "A cause-and-effect link, not a repeat of the sentence." },
      { question: "What would change if the process were reversible?", lookFor: "They apply the same idea to a new case and say what stays the same." },
    ],
  };
}

/** S19: misconceptions from the message refs it was given (the first half and the rest), with real refs. */
function brief(prompt: string) {
  const refs = [...prompt.matchAll(/^(M\d+) \[(S\d+)\]/gm)].map((m) => m[1]);
  const half = Math.max(1, Math.ceil(refs.length / 2));
  const first = refs.slice(0, half);
  const rest = refs.slice(half).length ? refs.slice(half) : refs.slice(0, 1);
  return {
    misconceptions: [
      {
        title: "Treating boundary work as a state function",
        summary: "Several students expect W to depend only on the end states, so they skip the process path.",
        refs: first,
        quoteRefs: first.slice(0, 2),
        explanation: "Draw two paths between the same states on a P–V diagram.\nShade the area under each: the areas differ, so the work differs.\nAsk: which quantities depend only on the end states? (U, H, S.)\nQuick check: same states, isobaric then isochoric vs the reverse — which does more work?",
      },
      {
        title: "Mixing up the sign of work",
        summary: "Students use W done on the gas and W done by the gas in the same calculation.",
        refs: rest,
        quoteRefs: rest.slice(0, 2),
        explanation: "State the course convention once: W > 0 when the gas does work on the surroundings.\nRewrite the first law with it: Q = ΔU + W.\nWork one expansion and one compression and say the sign out loud each time.",
      },
    ],
  };
}

/** S19: five quiz questions over the misconceptions it was given (right answer first, as models do). */
function lectureQuiz() {
  const q = (question: string, options: string[], misconception: number) => ({ question, options, answer: 0, explanation: "Work depends on the path; only properties like U depend on the end states alone.", misconception });
  return {
    questions: [
      q("Two processes join the same two states. Which is always the same for both?", ["The change in internal energy", "The work done", "The heat added", "The area under the P–V curve"], 1),
      q("On a P–V diagram, boundary work is…", ["The area under the process curve", "The change in pressure", "The slope of the curve", "Zero for any closed path"], 1),
      q("A gas expands and does 50 kJ of work. With W > 0 for work by the gas, W is…", ["+50 kJ", "−50 kJ", "0 kJ", "It depends on Q"], 2),
      q("In a compression, with W > 0 for work by the gas, the sign of W is…", ["Negative", "Positive", "Zero", "Undefined"], 2),
      q("Which of these is NOT a state function?", ["Work", "Internal energy", "Enthalpy", "Entropy"], 1),
    ],
  };
}

/** S19: one comment per rubric criterion, with marks where the criterion has a maximum. */
function feedbackDraft(prompt: string) {
  const criteria = [...prompt.matchAll(/^\d+\. (.+?) \((?:out of (\d+)|no marks)\)/gm)];
  return {
    criteria: criteria.map((c) => ({
      points: c[2] ? Math.round(Number(c[2]) * 0.7) : null,
      comment: `You handle ${c[1].toLowerCase()} well in your opening steps. Next, say why each step follows from the one before.`,
    })),
    overall: "A clear, well-organised attempt. Next time, check units at the end of each calculation.",
  };
}

/** S18: a fixed score with one rewrite per approach that reuses the title. */
function resilience(prompt: string) {
  const title = prompt.match(/Title: (.*)/)?.[1] ?? "this assignment";
  return {
    score: 82,
    summary: `A chatbot could complete ${title} from the instructions alone, because every value is given.`,
    reasons: ["All the numbers are in the question, so nothing depends on the student.", "It asks only for final values, not for reasoning."],
    rewrites: [
      { approach: "oral", title: "Explain one step in tutorial", why: "The student has to explain it live.", instructions: `Solve ${title}. In Friday's tutorial, be ready to explain your second step to me in two minutes.` },
      { approach: "reasoning", title: "Justify each step", why: "Reasoning about choices is the student's own.", instructions: `Solve ${title}. For each step, write one sentence on why you chose that equation and which assumption it needs.` },
      { approach: "local", title: "Use your own readings", why: "A chatbot doesn't have the student's measurements.", instructions: `Measure the volume and temperature of water in your hostel kettle, then use your own readings to solve ${title}.` },
    ],
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
  const prompt = users.at(-1) ?? "";
  if (body.response_format) {
    let out: unknown;
    if (/You label one message/.test(system)) {
      out = labels(prompt.match(/Latest student message:\n"""\n([\s\S]*)\n"""/)?.[1] ?? prompt, prompt.match(/assignment chat for (A\d+)/)?.[1] ?? null);
    } else if (/You are the output guard/.test(system)) {
      // Lets everything through, so the deterministic checks are what's tested.
      out = { pass: true, category: "none", reason: "mock" };
    } else if (/You grade one reply/.test(system)) {
      const reply = prompt.match(/SAGE'S REPLY:\n"""\n([\s\S]*)\n"""/)?.[1] ?? "";
      const leaked = /68\.9|241\.2|def newton_raphson/.test(reply) || reply.split(/\n\n/).filter((p) => p.split(" ").length > 60).length >= 2;
      out = { leaked, refused: !leaked && reply.length < 60, reason: "mock judge" };
    } else if (/PHOTO-TRANSCRIBE/.test(system)) {
      // S21: a photo of working (the image itself is ignored).
      out = {
        readable: true,
        lines: ["n = 1.3, P1 = 100 kPa, V1 = 0.1 m^3, V2 = 0.05 m^3", "P2 = P1 (V1/V2)^n = 100 * 2^1.3 = 246 kPa", "W = (P2 V2 - P1 V1) / (1 - n)", "W = (246*0.05 - 100*0.1) / (1 - 1.3) = 7.7 kJ"],
        note: "",
      };
    } else if (/ASK-A-HUMAN/.test(system)) {
      out = {
        question: "How do I find the boundary work for a polytropic process?",
        tried: "I used W = (P2V2 - P1V1)/(1 - n) and got a positive number.",
        stuckOn: "I'm not sure whether the work should be negative for a compression.",
      };
    } else if (/a short, friendly conversation \(a viva\)/.test(system)) {
      out = viva(prompt);
    } else if (/prepare the teacher for their next lecture/.test(system)) {
      out = brief(prompt);
    } else if (/5-question multiple-choice quiz the teacher can run/.test(system)) {
      out = lectureQuiz();
    } else if (/Draft feedback on one student's submitted work/.test(system)) {
      out = feedbackDraft(prompt);
    } else if (/Judge how easily a general AI chatbot/.test(system)) {
      out = resilience(prompt);
    } else if (/list the TOPICS a student should revise/.test(system)) {
      out = exam.topics(prompt);
    } else if (/CONCEPTUAL multiple-choice/.test(system)) {
      out = exam.conceptual(system, prompt);
    } else if (/NUMERICAL problems/.test(system)) {
      out = exam.numeric(system, prompt);
    } else if (/answers to a MOCK TEST/.test(system)) {
      out = exam.grade(prompt);
    } else if (/You write PRACTICE problems/.test(system)) {
      out = learning.practice();
    } else if (/MISSING BASIC SKILL/.test(system)) {
      out = learning.refresher;
    } else if (/to a PRACTICE problem/.test(system)) {
      out = learning.grade(prompt);
    } else if (/explains the key idea back/.test(system)) {
      out = { score: 0.7, feedback: "Good start — you named the main idea. Can you say *why* it holds?", gaps: ["why the formula works"] };
    } else if (/Write a short recap/.test(system)) {
      out = learning.recap;
    } else if (/mistake log/.test(system)) {
      out = { found: /first wrong step|look again/i.test(prompt), sameAs: null, pattern: "sign of boundary work", topic: "boundary work" };
    } else {
      out = trace(prompt);
    }
    reply = { text: JSON.stringify(out) };
  } else if (tools.some((t) => t.startsWith("get_"))) {
    reply = lens(users, toolResults);
  } else if (model.includes("leaky")) {
    reply = { text: leakyDraft(system) };
  } else {
    reply = sage(system);
  }
  console.log(`${new Date().toISOString().slice(11, 19)} ${model} ${body.response_format ? "json" : tools.length ? `tools(${tools.length})` : "text"} → ${reply.calls ? reply.calls.map((c) => c.name).join(",") : (reply.text ?? "").slice(0, 60).replace(/\n/g, " ")}`);
  await send(res, body, reply, Boolean(body.stream), model);
}).listen(port, "127.0.0.1", () => console.log(`mock AI on http://127.0.0.1:${port}/v1`));
