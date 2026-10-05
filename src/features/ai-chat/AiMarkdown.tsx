import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, ImageOff } from "lucide-react";
import { ImageLightbox } from "./ImageGallery";
import "./highlight.css";
import { copyToClipboard, isHttpUrl } from "./utils";
import type { AiAttachment } from "./types";

function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) return nodeToText((node.props as { children?: ReactNode }).children);
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const codeElement = Children.toArray(children).find(isValidElement) as
    | ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;
  const className = codeElement?.props.className ?? "";
  const language = /language-([\w+#-]+)/.exec(className)?.[1] ?? "";
  const rawText = nodeToText(codeElement?.props.children ?? children).replace(/\n$/, "");

  const handleCopy = async () => {
    if (await copyToClipboard(rawText)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="ai-code-block mb-2 overflow-hidden rounded-lg border border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="text-[11.5px] font-medium lowercase text-[#8b949e]">{language || "код"}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#8b949e] transition-colors hover:text-white"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12.5px] leading-relaxed">
        <code className={`hljs ${className}`}>{codeElement?.props.children ?? children}</code>
      </pre>
    </div>
  );
}

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!isHttpUrl(src)) return null;

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
        <ImageOff size={12} /> {alt || "изображение недоступно"}
      </span>
    );
  }

  const attachment: AiAttachment = {
    type: "image",
    name: alt || "image",
    key: "",
    mime: "image/*",
    size: 0,
    url: src,
    fetchedAt: Date.now(),
    local: true,
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-2 block cursor-zoom-in overflow-hidden rounded-lg border border-border"
      >
        <img
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-[420px] w-auto max-w-full object-contain"
        />
      </button>
      <ImageLightbox
        images={[attachment]}
        index={open ? 0 : null}
        onIndexChange={() => undefined}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function AiMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 text-[13.5px] leading-relaxed text-foreground last:mb-0">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="mb-2 mt-3 text-[15px] font-semibold text-foreground first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-3 text-[14px] font-semibold text-foreground first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-2.5 text-[13.5px] font-semibold text-foreground first:mt-0">{children}</h3>
        ),
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-1 text-[13.5px] text-foreground">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-1 text-[13.5px] text-foreground">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        a: ({ children, href }) =>
          href && (isHttpUrl(href) || /^mailto:/i.test(href)) ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        img: ({ src, alt }) => <MarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} />,
        // Блочный код целиком рисует CodeBlock (внутри pre); здесь — только inline.
        code: ({ children, className }) => (
          <code className={`rounded bg-muted px-1 py-0.5 text-[12.5px] text-foreground ${className ?? ""}`}>
            {children}
          </code>
        ),
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-[12.5px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
        th: ({ children }) => <th className="px-3 py-2 font-medium text-muted-foreground">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-foreground">{children}</td>,
        hr: () => <hr className="my-3 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
