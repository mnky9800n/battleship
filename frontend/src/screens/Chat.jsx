import React, { useState, useRef, useEffect } from "react";
import { T, FONT, inputStyle } from "../theme.js";

// In-game chat (your messages + the opponent's / the AI's taunts). Collapsible:
// when collapsed, a launcher shows a red unread badge for messages you missed.

export default function Chat({ messages, onSend, me }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const scrollRef = useRef(null);
  const seenRef = useRef(0);

  // While open, everything is "seen". While collapsed, new messages accrue.
  useEffect(() => {
    if (open) seenRef.current = messages.length;
  }, [open, messages.length]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const unread = open ? 0 : Math.max(0, messages.length - seenRef.current);

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={launcher}>
        💬 COMMS
        {unread > 0 && <span style={badge}>{unread > 99 ? "99+" : unread}</span>}
      </button>
    );
  }

  return (
    <div style={wrap}>
      <div style={header}>
        <span>// COMMS</span>
        <button onClick={() => setOpen(false)} style={collapseBtn} title="collapse">▾</button>
      </div>
      <div ref={scrollRef} style={list}>
        {messages.length === 0 && <div style={{ color: T.greenDim, fontSize: 12 }}>no transmissions yet…</div>}
        {messages.map((m, i) => {
          const ai = m.from === "playerAI";
          const mine = m.from === me;
          const color = ai ? T.amber : mine ? T.green : T.greenSoft;
          const name = ai ? "🤖 playerAI" : mine ? "you" : m.from;
          return (
            <div key={i} style={{ marginBottom: 6, fontSize: 13 }}>
              <span style={{ color, fontWeight: 700 }}>{name}:</span>{" "}
              <span style={{ color: ai ? T.amber : T.greenSoft }}>{m.text}</span>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 6 }}>
        <input
          style={{ ...inputStyle, flex: 1, fontSize: 13, padding: "7px 9px" }}
          placeholder="talk smack…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
        />
        <button type="submit" style={sendBtn}>▶</button>
      </form>
    </div>
  );
}

const wrap = {
  position: "absolute", right: 16, bottom: 16, zIndex: 40, width: 300,
  display: "flex", flexDirection: "column", gap: 8, padding: 12,
  background: "rgba(4,10,6,0.9)", border: `1px solid ${T.greenDim}`,
  fontFamily: FONT, color: T.greenSoft, boxShadow: "0 0 20px rgba(57,255,20,0.12)",
};
const header = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, letterSpacing: 2, color: T.green, textShadow: T.glow };
const collapseBtn = { cursor: "pointer", background: "transparent", color: T.green, border: "none", fontSize: 16, lineHeight: 1, padding: 0 };
const list = { height: 170, overflowY: "auto", display: "flex", flexDirection: "column" };
const sendBtn = { cursor: "pointer", background: T.green, color: T.bg, border: "none", padding: "0 12px", fontFamily: FONT, fontSize: 14 };

const launcher = {
  position: "absolute", right: 16, bottom: 16, zIndex: 40,
  cursor: "pointer", background: "rgba(4,10,6,0.9)", color: T.green,
  border: `1px solid ${T.greenDim}`, padding: "10px 16px",
  fontFamily: FONT, fontSize: 14, letterSpacing: 1, textShadow: T.glow,
  boxShadow: "0 0 16px rgba(57,255,20,0.12)",
};
const badge = {
  position: "absolute", top: -10, right: -10,
  minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11,
  background: "#ff3b3b", color: "#fff", fontSize: 12, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "0 0 10px rgba(255,59,59,0.7)",
};
