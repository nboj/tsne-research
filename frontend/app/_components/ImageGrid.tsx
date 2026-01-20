import React from "react";
import { Data } from "./ScatterView";

interface Props {
  data: Data;
}

export default function ImageGrid({ data }: Props) {
  const nodesByQuery = React.useMemo(() => {
    if (!data?.nodes) return
    const map = new Map<number, typeof data.nodes>();

    for (const node of data.nodes) {
      const key = node.winner;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(node);
    }

    return map;
  }, [data?.nodes]);
  return (
    <div className="vizCard">
      <h3>Images</h3>

      {data?.queries && data.queries.map((query, qi) => (
        <div key={qi} className="query-section">
          {/* separator / header */}
          <h4 className="query-label">{query}</h4>

          <div className="imgGrid">
            {(nodesByQuery.get(qi) ?? []).map((n) => (
              <div key={n.id} className="thumb">
                <img src={`http://127.0.0.1:5000${n.path}`} alt="" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
