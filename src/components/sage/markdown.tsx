"use client";

import "katex/dist/katex.min.css";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { normalizeMath } from "@/lib/sage/math";

/** react-markdown passes its AST node as a prop; keep it off the DOM. */
function withoutNode<T extends object>(props: T): Omit<T, "node"> {
  const rest = { ...props } as T & { node?: unknown };
  delete rest.node;
  return rest;
}

const components: Components = {
  p: (props) => <p className="mb-3 last:mb-0" {...withoutNode(props)} />,
  ul: (props) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...withoutNode(props)} />,
  ol: (props) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...withoutNode(props)} />,
  h1: (props) => <h3 className="mt-4 mb-2 text-title first:mt-0" {...withoutNode(props)} />,
  h2: (props) => <h3 className="mt-4 mb-2 text-title first:mt-0" {...withoutNode(props)} />,
  h3: (props) => <h4 className="mt-3 mb-1 text-label first:mt-0" {...withoutNode(props)} />,
  a: (props) => (
    <a className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer" {...withoutNode(props)} />
  ),
  blockquote: (props) => (
    <blockquote className="mb-3 border-l-2 border-border-strong pl-3 text-muted-foreground" {...withoutNode(props)} />
  ),
  code: ({ className, ...props }) => (
    <code className={`rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em] ${className ?? ""}`} {...withoutNode(props)} />
  ),
  pre: (props) => (
    <pre
      className="mb-3 overflow-x-auto rounded-md border bg-background p-3 font-mono text-mono leading-relaxed last:mb-0 [&>code]:bg-transparent [&>code]:p-0"
      {...withoutNode(props)}
    />
  ),
  table: (props) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-small" {...withoutNode(props)} />
    </div>
  ),
  th: (props) => <th className="border-b px-2 py-1.5 text-left text-label" {...withoutNode(props)} />,
  td: (props) => <td className="border-b px-2 py-1.5 align-top" {...withoutNode(props)} />,
};

/** Sage's replies: Markdown with GFM tables, KaTeX maths and code blocks. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 break-words [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={components}>
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}
