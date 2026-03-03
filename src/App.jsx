import React, { useMemo, useState } from "react";
import "./App.css";

import boxCatalog from "./boxCatalog.json";
import { cartonize } from "./services/cartonize";

// Helper to generate simple IDs for UI rows
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function App() {
  // Multi-item order config
  const [items, setItems] = useState(() => [
    // Default example (Harry's-like)
    { id: uid(), name: "Kit (pixxa-style)", l: "12", w: "8", h: "3", wt: "1.2", qty: "1" },
    { id: uid(), name: "Soap", l: "4", w: "3", h: "2", wt: "0.4", qty: "1" },
    { id: uid(), name: "Shampoo", l: "7", w: "2.5", h: "2.5", wt: "0.7", qty: "1" },
  ]);

  // Global modeling inputs
  const [dimFactor, setDimFactor] = useState("139");
  const [padInches, setPadInches] = useState("1");

  // Hazmat UI (advisory for now)
  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState("");

  const hazmatClasses = useMemo(
    () => [
      "Class 1: Explosives",
      "Class 2: Gases",
      "Class 3: Flammable Liquids",
      "Class 4: Flammable Solids",
      "Class 5: Oxidizers & Organic Peroxides",
      "Class 6: Toxic & Infectious Substances",
      "Class 7: Radioactive Materials",
      "Class 8: Corrosives",
      "Class 9: Miscellaneous",
      "ORM-D: Other Regulated Materials – Domestic",
    ],
    []
  );

  const [output, setOutput] = useState(null);

  function updateItem(id, key, value) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: uid(), name: "", l: "", w: "", h: "", wt: "", qty: "1" },
    ]);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function clearOutput() {
    setOutput(null);
  }

  function handleSubmit(e) {
    e.preventDefault();

    // Convert UI rows to service input shape
    const serviceItems = items.map((it) => ({
      name: it.name,
      l: it.l,
      w: it.w,
      h: it.h,
      wt: it.wt,
      qty: it.qty,
    }));

    const res = cartonize({
      items: serviceItems,
      padInches: Number(padInches),
      dimFactor: Number(dimFactor),
      catalog: boxCatalog,
      hazmat: { isHazmat, hazmatClass },
    });

    setOutput(res);
  }

  return (
    <div className="page">
      <div className="card">
        <div className="header">
          <img
            className="logo"
            src="/logo.png"
            alt="Fosdick"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div>
            <h1 className="title">Fosdick Packaging Tool</h1>
            <p className="subtitle">
              Multi-item cartonization • Engineered + Stock options • Carrier-agnostic DIM modeling
            </p>
          </div>
        </div>

        {/* CONTROLS */}
        <form onSubmit={handleSubmit} className="form" onChange={clearOutput}>
          <div className="section">
            <h3>Order Configuration (Multiple Items)</h3>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "22%" }}>Item</th>
                    <th style={{ width: "10%" }}>L (in)</th>
                    <th style={{ width: "10%" }}>W (in)</th>
                    <th style={{ width: "10%" }}>H (in)</th>
                    <th style={{ width: "12%" }}>Wt (lb)</th>
                    <th style={{ width: "10%" }}>Qty</th>
                    <th style={{ width: "10%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <input
                          value={it.name}
                          onChange={(e) => updateItem(it.id, "name", e.target.value)}
                          placeholder="e.g., Bottle 60ct"
                        />
                      </td>
                      <td>
                        <input
                          value={it.l}
                          onChange={(e) => updateItem(it.id, "l", e.target.value)}
                          placeholder="L"
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          value={it.w}
                          onChange={(e) => updateItem(it.id, "w", e.target.value)}
                          placeholder="W"
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          value={it.h}
                          onChange={(e) => updateItem(it.id, "h", e.target.value)}
                          placeholder="H"
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          value={it.wt}
                          onChange={(e) => updateItem(it.id, "wt", e.target.value)}
                          placeholder="lb"
                          inputMode="decimal"
                        />
                      </td>
                      <td>
                        <input
                          value={it.qty}
                          onChange={(e) => updateItem(it.id, "qty", e.target.value)}
                          placeholder="Qty"
                          inputMode="numeric"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btnSecondary"
                          onClick={() => removeItem(it.id)}
                          disabled={items.length <= 1}
                          title={items.length <= 1 ? "Keep at least one item" : "Remove item"}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="actionsRow">
              <button type="button" className="btnSecondary" onClick={addItem}>
                + Add Item
              </button>
            </div>
          </div>

          <div className="row row4">
            <div className="field">
              <label>DIM Factor</label>
              <input
                value={dimFactor}
                onChange={(e) => setDimFactor(e.target.value)}
                placeholder="139"
                inputMode="numeric"
              />
            </div>

            <div className="field">
              <label>Global Padding Allowance (in)</label>
              <input
                value={padInches}
                onChange={(e) => setPadInches(e.target.value)}
                placeholder="1"
                inputMode="decimal"
              />
            </div>

            <div className="field">
              <label>Mailer “Slim” Threshold (in)</label>
              <input
                value={boxCatalog?.mailer_rules?.max_packed_height_in ?? 2}
                disabled
              />
            </div>

            <div className="field">
              <label>Catalog Source</label>
              <input value="boxCatalog.json" disabled />
            </div>
          </div>

          <div className="hazmat">
            <div className="hazmatTop">
              <div className="hazmatLabel">Special Handling — Hazmat/ORMD?</div>
              <div className="hazmatControls">
                <label className="check">
                  <input
                    type="radio"
                    name="haz"
                    checked={isHazmat === true}
                    onChange={() => setIsHazmat(true)}
                  />{" "}
                  Yes
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="haz"
                    checked={isHazmat === false}
                    onChange={() => setIsHazmat(false)}
                  />{" "}
                  No
                </label>
              </div>
            </div>

            {isHazmat && (
              <div className="field">
                <label>Hazmat/ORMD Class</label>
                <select value={hazmatClass} onChange={(e) => setHazmatClass(e.target.value)}>
                  <option value="">Select…</option>
                  {hazmatClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button className="btn" type="submit">
            Recommend Packaging
          </button>
        </form>

        {/* OUTPUT */}
        {output?.ok === false && <div className="error">{output.error}</div>}

        {output?.ok === true && (
          <div className="results">
            <div className="resultsHeader">
              <h2>Results</h2>
              <div className="pill">DIM Factor: {Number(dimFactor)}</div>
            </div>

            <div className="meta">
              <div>
                <strong>Packed dims (est):</strong>{" "}
                {output.packed.packedL.toFixed(1)} × {output.packed.packedW.toFixed(1)} ×{" "}
                {output.packed.packedH.toFixed(1)} in
              </div>
              <div>
                <strong>Total actual weight:</strong> {output.actualTotalWeight.toFixed(2)} lb
              </div>
              <div>
                <strong>Mailer eligible:</strong> {output.slimForMailer ? "Yes (slim pack)" : "No"}
              </div>
              {output.hazmatNote && <div className="hazNote">{output.hazmatNote}</div>}
            </div>

            {/* Engineered */}
            <div className="section">
              <h3>Engineered (Perfect Fit)</h3>
              <div className="best">
                <div className="bestTitle">{output.engineered.name}</div>
                <div className="bestBody">
                  <div>
                    <strong>{output.engineered.size}</strong>
                  </div>
                  <div className="muted">
                    DIM wt: {output.engineered.dimWeight} lb • Billed wt:{" "}
                    <strong>{output.engineered.billedWeight} lb</strong>
                  </div>
                  <div className="muted">{output.engineered.notes}</div>
                </div>
              </div>
            </div>

            {/* Best stock */}
            <div className="section">
              <h3>Best Stock Option</h3>
              {output.bestStock ? (
                <div className="best">
                  <div className="bestTitle">{output.bestStock.kind.toUpperCase()}</div>
                  <div className="bestBody">
                    <div>
                      <strong>{output.bestStock.name}</strong> <span className="muted">({output.bestStock.size})</span>
                    </div>
                    <div className="muted">
                      {output.bestStock.dimWeight != null ? `DIM wt: ${output.bestStock.dimWeight} lb • ` : ""}
                      Billed wt: <strong>{output.bestStock.billedWeight} lb</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="warn">No stock package in your catalog fits this packed estimate.</div>
              )}
            </div>

            {/* Mailers */}
            {output.topMailers?.length > 0 && (
              <div className="section">
                <h3>Top Mailer Options</h3>
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Mailer</th>
                        <th>Size</th>
                        <th>Billed wt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {output.topMailers.map((m, idx) => (
                        <tr key={m.id || m.name}>
                          <td>{idx + 1}</td>
                          <td>{m.name}</td>
                          <td>{m.size}</td>
                          <td>{m.billedWeight} lb</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="note">Mailers are modeled as billed ≈ actual weight (carrier-agnostic for now).</div>
                </div>
              </div>
            )}

            {/* Boxes */}
            {output.topBoxes?.length > 0 && (
              <div className="section">
                <h3>Top Box Options</h3>
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Box</th>
                        <th>Size</th>
                        <th>DIM wt</th>
                        <th>Billed wt</th>
                        <th>Vol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {output.topBoxes.map((b, idx) => (
                        <tr key={b.id || b.name}>
                          <td>{idx + 1}</td>
                          <td>{b.name}</td>
                          <td>{b.size}</td>
                          <td>{b.dimWeight} lb</td>
                          <td>{b.billedWeight} lb</td>
                          <td>{Math.round(b.packageVol)} in³</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="note">Ranked by lowest billed weight, then smallest package volume.</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
