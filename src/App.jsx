import React, { useState } from 'react';

export default function App() {
  const [form, setForm] = useState({
    length: '',
    width: '',
    height: '',
    weight: '',
    quantity: '',
    hazmat: 'no',
    hazmatClass: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const body = {
      ...form,
      length: Number(form.length),
      width: Number(form.width),
      height: Number(form.height),
      weight: Number(form.weight),
      quantity: Number(form.quantity),
    };
    try {
      const res = await fetch('https://fosdick-packaging-api.onrender.com/recommend-packaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setResult(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: 'auto', padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h2>📦 Fosdick Packaging Tool</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 15 }}>
        {/* Dimensions row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="number"
            name="length"
            placeholder="Avg Item Length"
            value={form.length}
            onChange={handleChange}
            style={{ flex: 1, padding: 8 }}
            required
          />
          <input
            type="number"
            name="width"
            placeholder="Avg Item Width"
            value={form.width}
            onChange={handleChange}
            style={{ flex: 1, padding: 8 }}
            required
          />
          <input
            type="number"
            name="height"
            placeholder="Avg Item Height"
            value={form.height}
            onChange={handleChange}
            style={{ flex: 1, padding: 8 }}
            required
          />
        </div>

        {/* Weight & Quantity */}
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="number"
            name="weight"
            placeholder="Avg Item Weight"
            value={form.weight}
            onChange={handleChange}
            style={{ flex: 1, padding: 8 }}
            required
          />
          <input
            type="number"
            name="quantity"
            placeholder="Item Multiplier"
            value={form.quantity}
            onChange={handleChange}
            style={{ flex: 1, padding: 8 }}
            required
          />
        </div>

        {/* Hazmat section */}
        <div style={{ display: 'grid', gap: 4 }}>
          <label>Special Handling – Hazmat/ORMD?</label>
          <div>
            <label style={{ marginRight: 10 }}>
              <input
                type="radio"
                name="hazmat"
                value="yes"
                checked={form.hazmat === 'yes'}
                onChange={handleChange}
              />{' '}
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="hazmat"
                value="no"
                checked={form.hazmat === 'no'}
                onChange={handleChange}
              />{' '}
              No
            </label>
          </div>
          {form.hazmat === 'yes' && (
            <select
              name="hazmatClass"
              value={form.hazmatClass}
              onChange={handleChange}
              style={{ padding: 8 }}
              required
            >
              <option value="">Select Hazmat/ORMD Class</option>
              <optgroup label="Classes (USPS Domestic)">
                <option value="Class_3">Flammable Liquids (Class 3)</option>
                <option value="Class_4">Flammable Solids (Class 4)</option>
                <option value="Class_5">Oxidizers (Class 5)</option>
                <option value="Class_6">Toxic Substances (Class 6)</option>
                <option value="Class_8">Corrosives (Class 8)</option>
                <option value="Class_9">Miscellaneous (Class 9)</option>
              </optgroup>
            </select>
          )}
        </div>

        <button type="submit" style={{ padding: 12, background: '#000', color: '#fff', cursor: 'pointer' }}>
          Get Recommendation
        </button>
      </form>

      {loading && <p>Loading...</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>📦 Packaging Recommendation</h3>
          <p><strong>Material:</strong> {result.materialRecommendation}</p>
          <p><strong>Box:</strong> {result.sizeRecommendation.name}</p>
        </div>
      )}
    </div>
  );
}

