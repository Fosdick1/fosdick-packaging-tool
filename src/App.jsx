import React, { useMemo, useState } from "react";
import "./App.css";

import boxCatalog from "./boxCatalog.json";
import { cartonize } from "./services/services/cartonize"; // ← UPDATED PATH

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function App() {
  const [items, setItems] = useState(() => [
    { id: uid(), name: "Kit (pixxa-style)", l: "12", w: "8", h: "3", wt: "1.2", qty: "1" },
    { id: uid(), name: "Soap", l: "4", w: "3", h: "2", wt: "0.4", qty: "1" },
    { id: uid(), name: "Shampoo", l: "7", w: "2.5", h: "2.5", wt: "0.7", qty: "1" },
  ]);

  const [dimFactor, setDimFactor] = useState("139");
  const [padInches, setPadInches] = useState("1");

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

        <form onSubmit={handleSubmit} className="form" onChange={clearOutput}>
          <div className="section">
            <h3>Order Configuration (Multiple Items)</h3>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>L (in)</th>
                    <th>W (in)</th>
                    <th>H (in)</th>
                    <th>Wt (lb)</th>
                    <th>Qty</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <input
                          value={it.name}
                          onChange={(e) => updateItem(it.id, "name", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={it.l}
                          onChange={(e) => updateItem(it.id, "l", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={it.w}
                          onChange={(e) => updateItem(it.id, "w", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={it.h}
                          onChange={(e) => updateItem(it.id, "h", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={it.wt}
                          onChange={(e) => updateItem(it.id, "wt", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          value={it.qty}
                          onChange={(e) => updateItem(it.id, "qty", e.target.value)}
                        />
                      </td>
                      <td>
                        <button type="button" onClick={() => removeItem(it.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" onClick={addItem}>
              + Add Item
            </button>
          </div>

          <div className="row">
            <div>
              <label>DIM Factor</label>
              <input
                value={dimFactor}
                onChange={(e) => setDimFactor(e.target.value)}
              />
            </div>

            <div>
              <label>Global Padding (in)</label>
              <input
                value={padInches}
                onChange={(e) => setPadInches(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label>Hazmat?</label>
            <input
              type="checkbox"
              checked={isHazmat}
              onChange={(e) => setIsHazmat(e.target.checked)}
            />
          </div>

          {isHazmat && (
            <select
              value={hazmatClass}
              onChange={(e) => setHazmatClass(e.target.value)}
            >
              <option value="">Select</option>
              {hazmatClasses.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}

          <button type="submit">Recommend Packaging</button>
        </form>

        {output?.ok === false && <div>{output.error}</div>}

        {output?.ok === true && (
          <div>
            <h3>Engineered Fit</h3>
            <div>{output.engineered.size}</div>

            <h3>Best Stock Option</h3>
            <div>{output.bestStock?.name}</div>
          </div>
        )}
      </div>
    </div>
  );
}
