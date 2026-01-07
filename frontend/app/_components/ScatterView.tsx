"use client";

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

const COLORS = [
  "#6bd089",
  "#ffa36c",
  "#6aa9ff",
  "#f79ac0",
  "#b08cff",
  "#ffd56a",
];

type NodeDatum = d3.SimulationNodeDatum & {
  id: string;
  winner: number;
  max_similarity?: number;
};

type LinkDatum = {
  source: string;
  target: string;
  weight: number;
};

// What D3’s forceLink mutates into at runtime:
type SimLink = d3.SimulationLinkDatum<NodeDatum> & { weight: number };

type Data = {
  queries: string[];
  nodes: {
    id: string;
    path: string;
    winner: number;
    max_similarity?: number;
  }[];
  edges: LinkDatum[];
};

interface Props {
  data: Data;
}

const ENTER_MS = 1000; // progressive insert duration
const EXIT_MS = 800;

function safeExtent(
  ext: [number, number] | [undefined, undefined] | any,
): [number, number] {
  const a = ext?.[0];
  const b = ext?.[1];
  if (a == null || b == null) return [0, 1];
  if (a === b) return [a - 1, b + 1]; // prevent NaN scales
  return [a, b];
}

export default function ScatterView({ data }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // persistent D3 objects
  const simRef = useRef<d3.Simulation<NodeDatum, undefined> | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const linkGRef = useRef<SVGGElement | null>(null);
  const nodeGRef = useRef<SVGGElement | null>(null);
  const labelGRef = useRef<SVGGElement | null>(null);

  // selections used by the tick handler (MUST be refs)
  const nodeSelRef = useRef<d3.Selection<
    SVGCircleElement,
    NodeDatum,
    SVGGElement,
    unknown
  > | null>(null);
  const linkSelRef = useRef<d3.Selection<
    SVGLineElement,
    SimLink,
    SVGGElement,
    unknown
  > | null>(null);
  const labelSelRef = useRef<d3.Selection<
    SVGTextElement,
    NodeDatum,
    SVGGElement,
    unknown
  > | null>(null);

  // keep node objects stable across renders so simulation doesn’t “reset”
  const nodeByIdRef = useRef<Map<string, NodeDatum>>(new Map());

  // progressive insert state
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  const color = useMemo(
    () => (winner: number) =>
      COLORS[(((winner ?? 0) % COLORS.length) + COLORS.length) % COLORS.length],
    [],
  );

  useEffect(() => {
    if (!svgRef.current) return;
    if (!data.edges || !data.nodes) return;

    const width = 900;
    const height = 600;
    const svg = d3.select(svgRef.current);
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // init groups once
    if (!gRef.current) {
      const g = svg.append("g");
      gRef.current = g.node() as SVGGElement;

      linkGRef.current = g
        .append("g")
        .attr("stroke", "currentColor")
        .node() as SVGGElement;
      nodeGRef.current = g
        .append("g")
        .attr("stroke", "currentColor")
        .attr("stroke-width", 1.2)
        .node() as SVGGElement;
      labelGRef.current = g
        .append("g")
        .attr("font-size", 11)
        .attr("pointer-events", "none")
        .node() as SVGGElement;

      svg.call(
        d3.zoom<SVGSVGElement, unknown>().on("zoom", (e) => {
          d3.select(gRef.current!).attr("transform", e.transform.toString());
        }),
      );
    }

    // stop prior progressive insert loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const incomingIds = new Set(data.nodes.map((n) => n.id));

    // 1) REMOVE nodes that no longer exist (they’ll exit-transition)
    for (const id of Array.from(visibleIdsRef.current)) {
      if (!incomingIds.has(id)) visibleIdsRef.current.delete(id);
    }
    // also prune node objects (optional, but keeps map from growing forever)
    for (const id of Array.from(nodeByIdRef.current.keys())) {
      if (!incomingIds.has(id)) nodeByIdRef.current.delete(id);
    }

    // 2) Ensure NodeDatum objects are stable (reuse if exists)
    const orderedAllNodes: NodeDatum[] = data.nodes.map((n) => {
      const existing = nodeByIdRef.current.get(n.id);
      if (existing) {
        existing.winner = n.winner ?? 0;
        existing.max_similarity = n.max_similarity;
        return existing;
      }
      const created: NodeDatum = {
        id: n.id,
        winner: n.winner ?? 0,
        max_similarity: n.max_similarity,
        x: width / 2 + (Math.random() - 0.5) * 80,
        y: height / 2 + (Math.random() - 0.5) * 80,
      };
      nodeByIdRef.current.set(n.id, created);
      return created;
    });

    // 3) Progressive insert for NEW ids only (don’t clear existing)
    const newIds = orderedAllNodes
      .map((n) => n.id)
      .filter((id) => !visibleIdsRef.current.has(id));
    const start = performance.now();

    function step(now: number) {
      const t = Math.min(1, (now - start) / ENTER_MS);
      const take = Math.floor(t * newIds.length);

      for (let i = 0; i < take; i++) visibleIdsRef.current.add(newIds[i]);

      updateGraph(); // redraw & update sim

      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }

    // if nothing new, still update (for removals / weight changes)
    if (newIds.length) rafRef.current = requestAnimationFrame(step);
    else updateGraph();

    // ---------- UPDATE GRAPH ----------
    function updateGraph() {
      const visibleNodes = orderedAllNodes.filter((n) =>
        visibleIdsRef.current.has(n.id),
      );

      // build sim links and let forceLink resolve endpoints by id via .id()
      const visibleLinksRaw = data.edges.filter(
        (e) =>
          visibleIdsRef.current.has(e.source) &&
          visibleIdsRef.current.has(e.target),
      );

      const visibleLinks: SimLink[] = visibleLinksRaw.map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }));

      // scales (safe extents)
      const wExtent = safeExtent(
        d3.extent(visibleLinks, (d) => d.weight) as any,
      );
      const wNorm = d3
        .scalePow()
        .exponent(2.2)
        .domain(wExtent)
        .range([0, 1])
        .clamp(true);

      const sExtent = safeExtent(
        d3.extent(visibleNodes, (d) => d.max_similarity ?? 0) as any,
      );
      const sNorm = d3
        .scalePow()
        .exponent(1.8)
        .domain(sExtent)
        .range([0, 1])
        .clamp(true);

      const rFinal = (d: NodeDatum) => 3 + 12 * sNorm(d.max_similarity ?? 0);
      const fillOFinal = (d: NodeDatum) =>
        0.35 + 0.65 * sNorm(d.max_similarity ?? 0);
      const linkOFinal = (d: SimLink) => 0.08 + 0.3 * wNorm(d.weight);
      const linkWFinal = (d: SimLink) => 0.3 + 2.2 * wNorm(d.weight);

      // ----- LINKS JOIN -----
      const linkG = d3.select(linkGRef.current!);

      const linkJoin = linkG
        .selectAll<SVGLineElement, SimLink>("line")
        .data(visibleLinks, (d: any) => {
          const s = (d.source as any).id ?? d.source;
          const t = (d.target as any).id ?? d.target;
          return `${s}|${t}`;
        });

      linkJoin
        .exit()
        .transition()
        .duration(EXIT_MS)
        .style("opacity", 0)
        .remove();

      const linkEnter = linkJoin.enter().append("line").style("opacity", 0);

      const linkSel = linkEnter.merge(linkJoin as any);
      linkSelRef.current = linkSel;

      linkSel
        .attr("stroke-opacity", (d) => linkOFinal(d))
        .attr("stroke-width", (d) => linkWFinal(d));

      linkEnter.transition().duration(350).style("opacity", 1);

      // ----- NODES JOIN -----
      const nodeG = d3.select(nodeGRef.current!);

      const nodeJoin = nodeG
        .selectAll<SVGCircleElement, NodeDatum>("circle")
        .data(visibleNodes, (d) => d.id);

      nodeJoin
        .exit()
        .transition()
        .duration(EXIT_MS)
        .attr("r", 0)
        .style("opacity", 0)
        .remove();

      const nodeEnter = nodeJoin
        .enter()
        .append("circle")
        .attr("r", 0)
        .style("opacity", 1);

      const nodeSel = nodeEnter.merge(nodeJoin as any);
      nodeSelRef.current = nodeSel;

      nodeSel
        .attr("fill", (d) => color(d.winner))
        .attr("fill-opacity", (d) => fillOFinal(d));

      nodeEnter
        .transition()
        .duration(1)
        .attr("r", (d) => rFinal(d));
      nodeJoin
        .transition()
        .duration(350)
        .attr("r", (d) => rFinal(d));

      // ----- LABELS -----
      const showLabels = visibleNodes.length <= 80;
      const labelG = d3.select(labelGRef.current!);
      labelG.style("display", showLabels ? null : "none");

      if (showLabels) {
        const labelJoin = labelG
          .selectAll<SVGTextElement, NodeDatum>("text")
          .data(visibleNodes, (d) => d.id);

        labelJoin.exit().remove();

        const labelEnter = labelJoin
          .enter()
          .append("text")
          .attr("dy", -10)
          .style("opacity", 0)
          .text((d) => d.id);

        const labelSel = labelEnter.merge(labelJoin as any);
        labelSelRef.current = labelSel;

        labelEnter.transition().duration(250).style("opacity", 1);
      } else {
        labelSelRef.current = null;
      }

      // ----- SIMULATION -----
      if (!simRef.current) {
        simRef.current = d3
          .forceSimulation<NodeDatum>()
          .alphaDecay(0.001)
          .velocityDecay(0.55)
          .force("charge", d3.forceManyBody<NodeDatum>().strength(-520))
          .force("collide", d3.forceCollide<NodeDatum>(10))
          .force("x", d3.forceX<NodeDatum>(width / 2).strength(0.05))
          .force("y", d3.forceY<NodeDatum>(height / 2).strength(0.05))
          .force("center", d3.forceCenter(width / 2, height / 2))
          .on("tick", () => {
            const ns = nodeSelRef.current;
            const ls = linkSelRef.current;
            const ts = labelSelRef.current;
            if (!ns || !ls) return;

            // update positions from sim state directly
            ns.attr("cx", (d) => d.x ?? 0).attr("cy", (d) => d.y ?? 0);

            if (ts) ts.attr("x", (d) => d.x ?? 0).attr("y", (d) => d.y ?? 0);

            ls.attr("x1", (d: any) => (d.source as NodeDatum).x ?? 0)
              .attr("y1", (d: any) => (d.source as NodeDatum).y ?? 0)
              .attr("x2", (d: any) => (d.target as NodeDatum).x ?? 0)
              .attr("y2", (d: any) => (d.target as NodeDatum).y ?? 0);
          });
      }

      const density = visibleLinks.length / Math.max(1, visibleNodes.length);
      const chargeStrength = -520 - 80 * Math.min(6, density);

      (simRef.current.force("charge") as d3.ForceManyBody<NodeDatum>).strength(
        chargeStrength,
      );

      simRef.current
        .nodes(visibleNodes)
        .force(
          "link",
          d3
            .forceLink<NodeDatum, SimLink>(visibleLinks)
            .id((d) => d.id)
            .strength((l) => 0.05 + 0.35 * wNorm(l.weight))
            .distance((l) => 120 + 180 * (1 - wNorm(l.weight))),
        )
        .alpha(0.6)
        .restart();

      // apply drag to current node selection (using latest sim)
      nodeSel.call(
        d3
          .drag<SVGCircleElement, NodeDatum>()
          .on("start", (event, d) => {
            if (!event.active) simRef.current!.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simRef.current!.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [data, color]);

  // stop sim on unmount
  useEffect(() => {
    return () => {
      simRef.current?.stop();
    };
  }, []);

  return <svg ref={svgRef} style={{ width: "100%", height: "auto" }} />;
}
