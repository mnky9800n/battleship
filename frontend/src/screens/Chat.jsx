import React, { useState, useRef, useEffect } from "react";
import { T, FONT, inputStyle } from "../theme.js";

// In-game chat: your messages + the opponent's (the AI's taunts post here too).
// A small bottom-right overlay so it doesn't disturb the boards.

export default function Chat({ messages, onSend, me }) {
  const [text, setText] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <div style={wrap}>
      <div style={header}>// COMMS</div>
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
const header = { fontSize: 13, letterSpacing: 2, color: T.green, textShadow: T.glow };
const list = { height: 170, overflowY: "auto", display: "flex", flexDirection: "column" };
const sendBtn = {
  cursor: "pointer", background: T.green, color: T.bg, border: "none",
  padding: "0 12px", fontFamily: FONT, fontSize: 14,
};
