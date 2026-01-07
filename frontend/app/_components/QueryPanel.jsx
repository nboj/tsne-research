const COLORS = ["#6bd089", "#ffa36c", "#6aa9ff", "#f79ac0"];

interface Props {

}
export default function QueryPanel({ queries, setQueries, run }) {
  function update(i, v) {
    setQueries(queries.map((q, idx) => (idx === i ? v : q)));
  }

  function add() {
    setQueries([...queries, ""]);
  }

  function remove(i) {
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
          <button onClick={() => remove(i)}>✕</button>
        </div>
      ))}

      <div className="row">
        <button onClick={add}>+ Add</button>
        <button className="primary" onClick={run}>
          Run
        </button>
      </div>
    </aside>
  );
}
