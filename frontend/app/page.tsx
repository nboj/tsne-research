"use client";

import { useState } from "react";
import Header from "./_components/./Header";
import QueryPanel from "./_components/QueryPanel";
import ScatterView from "./_components/ScatterView";
import ImageGrid from "./_components/./ImageGrid";
import "./App.css";

export default function Home() {
  const [queries, setQueries] = useState(["a bird"]);
  const [nodes, setNodes] = useState<any>([]);
  const [pending, setPending] = useState<boolean>(false);

  async function runSearch() {
    const clean = queries.map((q) => q.trim()).filter(Boolean);
    if (!clean.length) return;
    setPending(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: clean, top_n: 300, min_img_sim: 0.2, per_query_n: 10, k_neighbors: 8 }),
      });

      const data = await res.json();
      console.log(data)
      setNodes(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app">
      <Header />
      <QueryPanel
        pending={pending}
        queries={queries}
        setQueries={setQueries}
        run={runSearch}
      />

      <main className="panel center">
        <ScatterView data={nodes} />
        <ImageGrid nodes={[]} />
      </main>
    </div>
  );
}
