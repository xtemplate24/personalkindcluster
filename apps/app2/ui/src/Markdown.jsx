// A tiny markdown renderer for model replies: code blocks, headings, lists,
// paragraphs, **bold**, *italic* and `inline code`.
// It builds React elements (never raw HTML), so a reply can't inject anything into the page.
import { useState } from "react";
import Icon from "./Icons.jsx";

function inline(text, keyBase) {
  const out = [];
  // `code` | **bold** | *italic*
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (t.startsWith("`")) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="code">
      <div className="code-head">
        <span>{lang || "code"}</span>
        <button onClick={copy} aria-label="Copy code">
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export default function Markdown({ text }) {
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ``` fenced code (an unfinished block while streaming still renders)
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++; // skip closing fence
      blocks.push(<CodeBlock key={blocks.length} lang={fence[1]} code={body.join("\n")} />);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      blocks.push(<h4 key={blocks.length}>{inline(h[2], blocks.length)}</h4>);
      i++;
      continue;
    }

    // - bullet / 1. numbered lists
    const isUl = (l) => /^\s*[-*•]\s+/.test(l);
    const isOl = (l) => /^\s*\d+[.)]\s+/.test(l);
    if (isUl(line) || isOl(line)) {
      const ordered = isOl(line);
      const test = ordered ? isOl : isUl;
      const items = [];
      while (i < lines.length && test(lines[i])) {
        items.push(lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/, ""));
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      const b = blocks.length;
      blocks.push(<Tag key={b}>{items.map((t, k) => <li key={k}>{inline(t, `${b}-${k}`)}</li>)}</Tag>);
      continue;
    }

    if (!line.trim()) { i++; continue; }

    // paragraph: consecutive plain lines
    const para = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !isUl(lines[i]) && !isOl(lines[i])
    ) para.push(lines[i++]);
    const b = blocks.length;
    blocks.push(
      <p key={b}>
        {para.flatMap((t, k) => (k ? [<br key={`br${k}`} />, ...inline(t, `${b}-${k}`)] : inline(t, `${b}-${k}`)))}
      </p>
    );
  }

  return <div className="md">{blocks}</div>;
}
