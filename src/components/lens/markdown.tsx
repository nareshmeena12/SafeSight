import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Lens's text answers: short markdown with lists, emphasis and small tables. */
const components: Components = {
  p: (props) => <p className="my-2 first:mt-0 last:mb-0" {...props} />,
  ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  a: ({ href, ...props }) => (
    <a href={href} className="text-primary underline underline-offset-4" target="_blank" rel="noreferrer" {...props} />
  ),
  h1: (props) => <p className="mt-4 mb-2 text-label" {...props} />,
  h2: (props) => <p className="mt-4 mb-2 text-label" {...props} />,
  h3: (props) => <p className="mt-4 mb-2 text-label" {...props} />,
  table: (props) => (
    <div className="my-3 overflow-x-auto rounded-md border">
      <table className="w-full text-small" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/60" {...props} />,
  th: (props) => <th className="px-3 py-2 text-left font-medium" {...props} />,
  td: (props) => <td className="border-t px-3 py-2 align-top" {...props} />,
  code: (props) => <code className="rounded-sm bg-muted px-1 font-mono text-[0.9em]" {...props} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
