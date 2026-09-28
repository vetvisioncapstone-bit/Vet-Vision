import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'

// Admin-only AI assistant (thesis 3.6). The server sends the AI aggregated clinic figures only. The conversation
// lives here, in memory: it survives moving between admin pages and is gone after a reload (nothing is saved).

const STARTERS = [
  "Summarize this month's performance",
  'Which products should I reorder?',
  'Compare Ibaan and San Jose',
  'Explain the forecast accuracy',
]
const HISTORY_TURNS = 12 // the server accepts at most this many earlier messages

// **bold** and *italic* inside a line.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

// The AI answers in simple Markdown: paragraphs, "- " or "1. " lists, **bold**, *italic*, "#" headings.
// Rendered as React elements (never as HTML), so nothing in a reply can run as markup.
function Formatted({ text }) {
  const blocks = []
  let list = null
  const flush = () => {
    if (list) blocks.push(<ul key={blocks.length}>{list.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (item) {
      (list ||= []).push(item[1])
      continue
    }
    flush()
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>)
  }
  flush()
  return blocks
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // { id, from: 'user' | 'bot' | 'error', text }
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const { pathname } = useLocation()
  const body = useRef(null)
  const input = useRef(null)
  const fab = useRef(null)

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight })
  }, [messages, busy])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    fab.current?.focus()
  }

  async function send(text) {
    const message = text.trim()
    if (!message || busy) return
    const history = messages
      .filter((m) => m.from !== 'error')
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', text: m.text }))
    setMessages((m) => [...m, { id: `${Date.now()}-u`, from: 'user', text: message }])
    setDraft('')
    setBusy(true)
    try {
      const { reply } = await api.post('/analytics/assistant/', { message, history, page: pathname.split('/')[2] || 'dashboard' })
      setMessages((m) => [...m, { id: `${Date.now()}-b`, from: 'bot', text: reply }])
    } catch (err) {
      setMessages((m) => [...m, { id: `${Date.now()}-e`, from: 'error', text: errorMessage(err, 'The assistant could not answer. Please try again.') }])
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  return (
    <>
      <section
        id="vv-assistant"
        className={`chat-panel${open ? ' show' : ''}`}
        aria-label="Vet Vision Assistant"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <div className="chat-panel-header">
          <div className="chat-bot-identity">
            <div className="chat-bot-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="2.3" /><circle cx="12" cy="4.5" r="2.3" /><circle cx="17" cy="7" r="2.3" /><path d="M12 12c-3.5 0-6.5 2.4-6.5 5.4 0 2 1.7 3.1 3.6 2.4.9-.3 1.9-.5 2.9-.5s2 .2 2.9.5c1.9.7 3.6-.4 3.6-2.4C18.5 14.4 15.5 12 12 12Z" /></svg>
            </div>
            <div>
              <h2 className="chat-bot-name">Vet Vision Assistant</h2>
              <p className="chat-bot-subtitle">AI · reads clinic totals only</p>
            </div>
          </div>
          <button type="button" className="chat-panel-close" aria-label="Close assistant" onClick={close}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="chat-panel-body" ref={body} aria-live="polite">
          <div className="chat-bubble bot">
            <p>Hi! Ask me about sales, stock, forecasts or reports for both branches. You can ask in English or Filipino.</p>
          </div>
          {messages.length === 0 && (
            <div className="chat-starters">
              {STARTERS.map((q) => (
                <button type="button" key={q} className="chat-starter" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.from}`} role={m.from === 'error' ? 'alert' : undefined}>
              {m.from === 'bot' ? <Formatted text={m.text} /> : m.text}
            </div>
          ))}
          {busy && <div className="chat-bubble bot chat-typing">Thinking…</div>}
        </div>

        <form className="chat-panel-input" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
          <input
            ref={input}
            type="text"
            aria-label="Ask the assistant"
            autoComplete="off"
            maxLength={2000}
            placeholder="Ask about sales, stock, forecasts…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="chat-send-btn" aria-label="Send" disabled={busy || !draft.trim()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </form>
        <p className="chat-note">AI suggestions from clinic totals. Check before acting.</p>
      </section>

      <button
        ref={fab}
        type="button"
        className="chat-fab"
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        aria-controls="vv-assistant"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
      </button>
    </>
  )
}
