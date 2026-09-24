// Rule-based FAQ chat assistant, ported verbatim from customer/index.html.
// Image paths updated from relative "Images/..." to root-relative "/Images/..." (%20-encoded).

import { useEffect, useRef, useState } from "react";
import { FAQ_ITEMS, findFaqAnswer } from "../lib/faq";
import { CloseIcon, SendIcon } from "./icons";

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    { id: "intro", from: "bot", text: "Hi! I'm the Vet Vision Assistant. Ask me about our hours, appointments, or services — or tap a question below." },
  ]);
  const [askedIds, setAskedIds] = useState(() => new Set());
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const remainingFaqs = FAQ_ITEMS.filter((item) => !askedIds.has(item.id));

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, typing, open]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  function pushExchange(questionText, answerText, itemId) {
    if (itemId) {
      setAskedIds((prev) => new Set(prev).add(itemId));
    }
    setMessages((m) => [...m, { id: `${Date.now()}-q`, from: "user", text: questionText }]);
    setTyping(true);
    typingTimeoutRef.current = setTimeout(() => {
      setMessages((m) => [...m, { id: `${Date.now()}-a`, from: "bot", text: answerText }]);
      setTyping(false);
    }, 700 + Math.random() * 500);
  }

  function handleQuickAsk(item) {
    if (typing) return;
    pushExchange(item.label, item.answer, item.id);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (typing) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    pushExchange(trimmed, findFaqAnswer(trimmed));
    setDraft("");
  }

  return (
    <>
      <button
        type="button"
        className={`chat-fab ${open ? "chat-fab--hidden" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Open Vet Vision Assistant"
      >
        <img src="/Images/EcovetLogo%201.png" alt="" className="chat-fab__logo" />
      </button>

      {open && (
        <>
          <div className="chat-scrim" onClick={() => setOpen(false)} />
          <div className="chat-panel" role="dialog" aria-label="Vet Vision Assistant">
          <div className="chat-panel__header">
            <span className="chat-panel__avatar">
              <img src="/Images/EcovetLogo%201.png" alt="" />
            </span>
            <div className="chat-panel__info">
              <p className="chat-panel__title">Vet Vision Assistant</p>
              <p className="chat-panel__subtitle">Quick answers about the clinic</p>
            </div>
            <button type="button" className="chat-panel__close" onClick={() => setOpen(false)} aria-label="Close assistant">
              <CloseIcon />
            </button>
          </div>

          <div className="chat-panel__messages" ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={`chat-row chat-row--${m.from}`}>
                {m.from === "bot" && (
                  <span className="chat-avatar">
                    <img src="/Images/EcovetLogo%201.png" alt="" />
                  </span>
                )}
                <div className={`chat-msg chat-msg--${m.from}`}>{m.text}</div>
              </div>
            ))}

            {typing && (
              <div className="chat-row chat-row--bot">
                <span className="chat-avatar">
                  <img src="/Images/EcovetLogo%201.png" alt="" />
                </span>
                <div className="chat-msg chat-msg--bot chat-typing">
                  <span className="chat-typing__dot" />
                  <span className="chat-typing__dot" />
                  <span className="chat-typing__dot" />
                </div>
              </div>
            )}

            {!typing && remainingFaqs.length > 0 && (
              <div className="chat-suggestions">
                {remainingFaqs.map((item) => (
                  <button type="button" key={item.id} className="chat-chip" onClick={() => handleQuickAsk(item)}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="chat-panel__input" onSubmit={handleSubmit}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a question…"
              aria-label="Type a question"
              disabled={typing}
            />
            <button type="submit" className="chat-panel__send" aria-label="Send" disabled={typing || !draft.trim()}>
              <SendIcon />
            </button>
          </form>
          </div>
        </>
      )}
    </>
  );
}
