import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "../lib/utils"

const proseClasses = {
  p: "mb-3 last:mb-0 text-foreground",
  ul: "list-disc pl-5 mb-3 space-y-0.5",
  ol: "list-decimal pl-5 mb-3 space-y-0.5",
  li: "my-0.5",
  blockquote: "border-l-4 border-border pl-4 my-3 text-muted-foreground italic",
  code: "rounded-md bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground",
  pre: "rounded-lg border border-border bg-muted p-4 overflow-x-auto my-3 text-sm",
  h1: "text-lg font-semibold leading-none tracking-tight mt-4 mb-2 first:mt-0 text-foreground",
  h2: "text-base font-semibold leading-none tracking-tight mt-3 mb-1.5 text-foreground",
  h3: "text-sm font-medium mt-2 mb-1 text-foreground",
  a: "text-primary underline underline-offset-4 hover:opacity-80 break-all",
  table: "w-full border-collapse my-3 text-sm",
  th: "border border-border bg-muted/50 px-3 py-2 text-left text-sm font-medium text-foreground",
  td: "border border-border px-3 py-2 text-sm text-foreground",
  hr: "border-border my-4",
}

export interface MarkdownContentProps {
  content: string
  className?: string
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  if (!content?.trim()) return null
  return (
    <div
      className={cn("markdown-content text-foreground break-words", className)}
      data-markdown
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className={proseClasses.p}>{children}</p>,
          ul: ({ children }) => <ul className={proseClasses.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={proseClasses.ol}>{children}</ol>,
          li: ({ children }) => <li className={proseClasses.li}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className={proseClasses.blockquote}>{children}</blockquote>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName
            if (isInline) {
              return (
                <code className={proseClasses.code} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="block text-foreground font-mono text-sm"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className={proseClasses.pre}>{children}</pre>
          ),
          h1: ({ children }) => <h1 className={proseClasses.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={proseClasses.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={proseClasses.h3}>{children}</h3>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={proseClasses.a}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <table className={proseClasses.table}>{children}</table>
          ),
          th: ({ children }) => <th className={proseClasses.th}>{children}</th>,
          td: ({ children }) => <td className={proseClasses.td}>{children}</td>,
          hr: () => <hr className={proseClasses.hr} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
