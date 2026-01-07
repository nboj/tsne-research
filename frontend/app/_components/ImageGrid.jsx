import React from "react";

export default function ImageGrid({ nodes }) {
  return (
    <div className="vizCard">
      <h3>Images</h3>
      <div className="imgGrid">
        {nodes.map(n => (
          <div key={n.id} className="thumb">
            <img
              src={`http://127.0.0.1:5000/images/${n.path}`}
              alt=""
            />
          </div>
        ))}
      </div>
    </div>
  );
}

