"use client";

import { useEffect, useState } from "react";
import Header from "./_components/./Header";
import QueryPanel from "./_components/QueryPanel";
import ScatterView from "./_components/ScatterView";
import ImageGrid from "./_components/ImageGrid";
import "./App.css";
import { Label, Slider } from "@heroui/react";

interface ParameterSliderProps {
  topN?: number | number[];
  onChange?: (n: number | number[]) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
}
const ParameterSlider = ({topN, onChange, label, min, max, step}: ParameterSliderProps) => {
  return (
    <Slider
      maxValue={max ?? 500}
      minValue={min ?? 0}
      defaultValue={topN ?? 0}
      step={step ?? 1}
      onChange={onChange ?? undefined}
      value={topN}
    >
      <Label>{label ?? "Undefined"}</Label>
      <Slider.Output />
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
};

export default function Home() {
  const [queries, setQueries] = useState(["a bird"]);
  const [nodes, setNodes] = useState<any>([]);
  const [pending, setPending] = useState<boolean>(false);
  const [topN, setTopN] = useState<number | number[]>(300);
  const [minImgSim, setMinImgSim] = useState<number | number[]>(0.2);
  const [perQueryN, setPerQueryN] = useState<number | number[]>(12);
  const [kNeighbors, setKNeighbors] = useState<number | number[]>(8);

  async function runSearch() {
    const clean = queries.map((q) => q.trim()).filter(Boolean);
    if (!clean.length) return;
    setPending(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: clean,
          top_n: topN as number,
          min_img_sim: minImgSim,
          per_query_n: perQueryN,
          k_neighbors: kNeighbors,
        }),
      });

      const data = await res.json();
      console.log(data);
      setNodes(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    runSearch()
  }, [topN, minImgSim, perQueryN, kNeighbors])

  return (
    <div className="app relative w-full">
      <Header />
      <QueryPanel
        pending={pending}
        queries={queries}
        setQueries={setQueries}
        run={runSearch}
      />

      <main className="panel center w-full relative">
        <div className="absolute light right-[1rem] top-[1rem] w-[12rem]">
          <ParameterSlider label="Top N" topN={topN} min={1} onChange={(v) => setTopN(v)}/>
          <ParameterSlider label="Min Img Similarity" topN={minImgSim} max={1} min={0.01} step={0.001} onChange={(v) => setMinImgSim(v)}/>
          <ParameterSlider label="Per Query N" topN={perQueryN} max={500} step={1} onChange={(v) => setPerQueryN(v)}/>
          <ParameterSlider label="N Neighbors" topN={kNeighbors} max={50} step={1} onChange={(v) => setKNeighbors(v)}/>
        </div>
        <ScatterView data={nodes} /> 
        <ImageGrid data={nodes} />
      </main>
    </div>
  );
}
