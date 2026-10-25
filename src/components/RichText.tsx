import { Fragment, type ReactNode } from "react";

/**
 * Renders teacher-written text safely (no HTML): paragraphs, line breaks, **bold**, _italic_,
 * and simple tables written with pipes:
 *   | Price | Quantity Supplied |
 *   | $3    | 100               |
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={`${keyBase}-${i++}`}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = (text ?? "").replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.trim().startsWith("|"))) {
          const rows = lines
            .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
            .filter((cells) => !cells.every((c) => /^:?-{2,}:?$/.test(c)));
          const [head, ...body] = rows;
          return (
            <div key={bi} className="prose-table my-2 overflow-x-auto">
              <table>
                <thead>
                  <tr>{head.map((c, i) => <th key={i} scope="col">{inline(c, `h${bi}${i}`)}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, `c${bi}${ri}${ci}`)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={bi} className={bi > 0 ? "mt-2" : undefined}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `p${bi}${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** For FIB prompts: show the blank as a visible underline. */
export function withBlank(text: string) {
  return text.replace(/_{3,}/g, "＿＿＿＿＿");
}
