import { Button, Spinner } from "@heroui/react";

const COLORS = ["#6bd089", "#ffa36c", "#6aa9ff", "#f79ac0"];

interface Props {
  queries: any[];
  setQueries: any;
  run: any;
  pending: boolean;
}
export default function QueryPanel({ queries, setQueries, run, pending }: Props) {
  function update(i: any, v: any) {
    setQueries(queries.map((q, idx) => (idx === i ? v : q)));
  }

  function add() {
    setQueries([...queries, ""]);
  }

  function remove(i: any) {
    setQueries(queries.filter((_, idx) => idx !== i));
  }

  return (
    <aside className="panel left">
      <h2>Queries</h2>

      {queries.map((q, i) => (
        <div key={i} className="row">
          <span
            className="qdot"
            style={{ background: COLORS[i % COLORS.length] }}
          />
          <input
            className="input"
            value={q}
            placeholder="enter prompt"
            onChange={e => update(i, e.target.value)}
          />
          <button disabled={pending} onClick={() => remove(i)}>✕</button>
        </div>
      ))}

      <div className="row">
        <Button onClick={add}>+ Add</Button>
        <Button isPending={pending} isDisabled={pending} className="primary" onPress={run}>
          {({isPending}) => (
            <>
              {isPending && <Spinner size="sm"  color="current"/>}
              {isPending ? "Running..":"Run"}
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
