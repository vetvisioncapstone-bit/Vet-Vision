import React, { useState } from 'react'

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { id: 'intro', from: 'bot', text: "Hi, I'm the Vet Vision Assistant. How can I help you today?" }
  ])
  const [draft, setDraft] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const message = draft.trim()
    if (!message) return

    setMessages(m => [...m, { id: `${Date.now()}-u`, from: 'user', text: message }])
    setDraft('')

    setTimeout(() => {
      setMessages(m => [...m, {
        id: `${Date.now()}-b`,
        from: 'bot',
        text: "Thanks for your message! I'm not connected to a live assistant yet - you're just seeing the chat layout for now."
      }])
    }, 500)
  }

  return (
    <>
      <div className={`chat-panel${open ? ' show' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="chat-panel-header">
          <div className="chat-bot-identity">
            <div className="chat-bot-logo">
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="7" r="2.3" /><circle cx="12" cy="4.5" r="2.3" /><circle cx="17" cy="7" r="2.3" /><path d="M12 12c-3.5 0-6.5 2.4-6.5 5.4 0 2 1.7 3.1 3.6 2.4.9-.3 1.9-.5 2.9-.5s2 .2 2.9.5c1.9.7 3.6-.4 3.6-2.4C18.5 14.4 15.5 12 12 12Z" /></svg>
            </div>
            <div>
              <p className="chat-bot-name">Vet Vision Assistant</p>
              <p className="chat-bot-subtitle">Chat bot</p>
            </div>
          </div>
          <button className="chat-panel-close" aria-label="Close chat" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="chat-panel-body">
          {messages.map(m => (
            <div key={m.id} className={`chat-bubble ${m.from}`}>{m.text}</div>
          ))}
        </div>

        <form className="chat-panel-input" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Type a message..."
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="chat-send-btn" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </form>
      </div>

      <button className="chat-fab" aria-label="Open chat" onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
      </button>
    </>
  )
}
