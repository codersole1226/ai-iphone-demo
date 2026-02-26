"use client";

import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setAnswer("");

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });

    const data = await res.json();
    setAnswer(data.answer || "");
    setLoading(false);
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>AI + 工具调用 Demo</h1>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="例如：帮我查一下 iphone 有哪些商品？"
        style={{ width: "100%", height: 120, marginTop: 12 }}
      />

      <button onClick={send} disabled={loading} style={{ marginTop: 12 }}>
        {loading ? "请求中..." : "发送"}
      </button>

      <pre style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{answer}</pre>
    </main>
  );
}