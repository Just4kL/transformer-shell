import type { ReactNode } from 'react'

/**
 * Небольшой безопасный рендерер Markdown: сперва экранируем весь ввод,
 * затем подставляем только собственные теги. Никакой сырой HTML из блока
 * пройти не может.
 */
const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

function inline(src: string): string {
  return escapeHtml(src)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    )
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
}

const isBlank = (l: string) => l.trim() === ''

export function renderMarkdown(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (isBlank(line)) {
      i += 1
      continue
    }

    // блок кода
    if (/^```/.test(line.trim())) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      out.push(
        <pre className="md-code" key={`c${key++}`}>
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // заголовки
    const head = /^(#{1,4})\s+(.*)$/.exec(line)
    if (head) {
      const level = head[1].length
      const text = inline(head[2])
      const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[level - 1]
      out.push(<Tag className={`md-h md-h${level}`} key={`h${key++}`} dangerouslySetInnerHTML={{ __html: text }} />)
      i += 1
      continue
    }

    // цитата
    if (/^>\s?/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      out.push(
        <blockquote className="md-quote" key={`q${key++}`} dangerouslySetInnerHTML={{ __html: inline(body.join(' ')) }} />,
      )
      continue
    }

    // маркированный список
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i += 1
      }
      out.push(
        <ul className="md-list" key={`u${key++}`}>
          {items.map((it, n) => (
            <li key={n} dangerouslySetInnerHTML={{ __html: inline(it) }} />
          ))}
        </ul>,
      )
      continue
    }

    // абзац
    const para: string[] = []
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,4}\s|>\s?|[-*+]\s|```)/.test(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    out.push(
      <p className="md-p" key={`p${key++}`} dangerouslySetInnerHTML={{ __html: inline(para.join(' ')) }} />,
    )
  }

  return out
}

/** Плоский текст без разметки — для заголовков и подсказок. */
export function plainText(source: string): string {
  return source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
