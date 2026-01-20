import os
from typing import Any, Literal, TypedDict, cast
from flask import Flask, request, jsonify
from flask_cors import CORS

import torch
import clip
import json
import numpy as np
# from sklearn.manifold import TSNE


app = Flask(__name__)
CORS(app)

device = "cuda" if torch.cuda.is_available() else "cpu"
model, _ = clip.load("ViT-B/32", device=device)


with open("./coco/image_clip_b32.json", "r") as f:
    data = json.load(f)

image_embeddings = np.array([d["embedding"] for d in data], dtype=np.float32)
image_paths = [d["image_path"] for d in data]

image_embeddings /= np.linalg.norm(image_embeddings, axis=1, keepdims=True)



def encode_texts(texts: list[str]) -> np.ndarray:
    with torch.no_grad():
        tokens = clip.tokenize(texts).to(device)
        vecs = model.encode_text(tokens).float().cpu().numpy()
    vecs /= (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-12)
    return vecs


class Node(TypedDict, total=False):
    id: str
    type: Literal["image"]
    path: str
    winner: int
    max_similarity: float
    scores: dict[str, float]


class Edge(TypedDict, total=False):
    source: str
    target: str
    weight: float


@app.route("/graph", methods=["POST"])
def graph():
    payload: dict[str, Any] = request.get_json(force=True) or {}
    queries_raw: Any = payload.get("queries", [])

    if not isinstance(queries_raw, list) or not all(isinstance(q, str) for q in queries_raw):
        return jsonify({"error": "queries must be a list of strings"}), 400

    queries: list[str] = cast(list[str], queries_raw)
    if not queries:
        return jsonify({"error": "queries required"}), 400

    # after normalizing image_embeddings and inside encode_text after normalizing vecs:

    print("image norms:", image_embeddings.shape,
          float(np.min(np.linalg.norm(image_embeddings, axis=1))),
          float(np.max(np.linalg.norm(image_embeddings, axis=1))))

    q_emb = encode_texts(queries)
    print("text norms:",
          float(np.min(np.linalg.norm(q_emb, axis=1))),
          float(np.max(np.linalg.norm(q_emb, axis=1))))

    sim_iq = image_embeddings @ q_emb.T
    print("sim range:", float(sim_iq.min()), float(sim_iq.max()))

    # knobs
    top_n: int = int(payload.get("top_n", 400))              # max images returned
    per_query_n: int = int(payload.get("per_query_n", 0))    # union top per query (recommended)
    min_img_sim: float = float(payload.get("min_img_sim", 0.2))  # threshold in query-score space
    k_neighbors: int = int(payload.get("k_neighbors", 6))    # edges per node (kNN), keeps graph sparse

    # image similarity
    q_emb: np.ndarray = encode_texts(queries)           # (Q, D)
    sim_iq: np.ndarray = image_embeddings @ q_emb.T     # (N, Q)

    n_images: int = sim_iq.shape[0]
    n_queries: int = sim_iq.shape[1]

    # choosing image subset
    if per_query_n > 0:
        per_query_n = max(1, min(per_query_n, n_images))
        chosen_set: set[int] = set()
        for j in range(n_queries):
            idx = np.argpartition(-sim_iq[:, j], per_query_n - 1)[:per_query_n]
            chosen_set.update(int(i) for i in idx)
        chosen = np.array(sorted(chosen_set), dtype=np.int32)

        if len(chosen) > top_n > 0:
            scores = sim_iq[chosen].max(axis=1)
            keep = np.argpartition(-scores, top_n - 1)[:top_n]
            chosen = chosen[keep]
    else:
        scores = sim_iq.max(axis=1)
        top_n = max(1, min(top_n, n_images))
        chosen = np.argpartition(-scores, top_n - 1)[:top_n].astype(np.int32)

    V: np.ndarray = sim_iq[chosen]

    # normalize in query-score space so dot == cosine similarity of "query response profiles"
    mu = V.mean(axis=0, keepdims=True)
    sd = V.std(axis=0, keepdims=True) + 1e-12
    Vz = (V - mu) / sd
    Vn = Vz / (np.linalg.norm(Vz, axis=1, keepdims=True) + 1e-12)
    S = Vn @ Vn.T
    #Vn: np.ndarray = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-12)
    #S: np.ndarray = Vn @ Vn.T
    print(V)

    # building image nodes
    nodes: list[Node] = []
    max_idx: np.ndarray = np.argmax(V, axis=1)
    max_val: np.ndarray = np.max(V, axis=1)

    for row, img_i in enumerate(chosen):
        i = int(img_i)
        scores_map: dict[str, float] = {queries[j]: float(V[row, j]) for j in range(n_queries)}
        raw = str(image_paths[i]).replace("\\", "/").lstrip("./")

        if raw.startswith("coco/"):
            raw = raw[len("coco/"):]

        path=f"/backend/coco/{raw}"
        nodes.append(Node(
            id=f"img_{i}",
            type="image",
            path=path,
            winner=int(max_idx[row]),
            max_similarity=float(max_val[row]),
            scores=scores_map,
        ))

    # building edeges based on query scores
    # M x M similarity;
    np.fill_diagonal(S, -np.inf)

    M: int = S.shape[0]
    k_neighbors = max(1, min(k_neighbors, M - 1)) if M > 1 else 0

    edges: list[Edge] = []
    seen: set[tuple[int, int]] = set()

    for a in range(M):
        if k_neighbors == 0:
            break
        nbrs = np.argpartition(-S[a], k_neighbors - 1)[:k_neighbors]
        # sort neighbors by strength
        nbrs = nbrs[np.argsort(-S[a, nbrs])]

        for b in nbrs:
            w = float(S[a, int(b)])
            if w < min_img_sim:
                continue

            ia = int(chosen[a])
            ib = int(chosen[int(b)])
            u, v = (ia, ib) if ia < ib else (ib, ia)
            if (u, v) in seen:
                continue
            seen.add((u, v))

            edges.append(Edge(
                source=f"img_{u}",
                target=f"img_{v}",
                weight=w,
            ))

    return jsonify({
        "queries": queries,
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "total_images": int(n_images),
            "returned_images": int(len(chosen)),
            "returned_edges": int(len(edges)),
            "k_neighbors": int(k_neighbors),
            "min_img_sim": float(min_img_sim),
        }
    })

from flask import send_from_directory, abort

COCO_ROOT = os.path.abspath("./coco")

@app.get("/backend/coco/<path:relpath>")
def serve_coco(relpath: str):
    full = os.path.abspath(os.path.join(COCO_ROOT, relpath))

    if not full.startswith(COCO_ROOT + os.sep):
        abort(400)

    if not os.path.isfile(full):
        abort(404)

    return send_from_directory(os.path.dirname(full), os.path.basename(full))


if __name__ == "__main__":
    print("Running on http://127.0.0.1:5000")
    app.run(debug=True)
