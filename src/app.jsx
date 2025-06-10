import React, { useState } from 'react';

export default function App() {
  const [form, setForm] = useState({ length: '', width: '', height: '', quantity: '', fragility: 'low' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('https://fosdick-packaging-api.onrender.com/recommend-packaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          length: Number(form.length),
          width: Number(form.width),
          height: Number(form.height),
          quantity: Number(form.quantity),
          fragility: form.fragility,
        })
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: 'auto', padding: 20 }}>
      <h2>📦 Fosdick Packaging Tool</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input type="number" name="length" placeholder="Length" required onChange={handleChange} />
          <input type="number" name="width" placeholder="Width" required onChange={handleChange} />
          <input type="number" name="height" placeholder="Height" required onChange={handleChange} />
        </div>
        <input type="number" name="quantity" placeholder="Quantity" required onChange={handleChange} />
        <select name="fragility" onChange={handleChange}>
          <option value="low">Not Fragile</option>
          <option value="medium">Moderately Fragile</option>
          <option value="high">Highly Fragile</option>
        </select>
        <button type="submit">Get Recommendation</button>
      </form>

      {loading && <p>Loading...</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>📦 Recommendation</h3>
          <p><strong>Material:</strong> {result.materialRecommendation}</p>
          <p><strong>Box:</strong> {result.sizeRecommendation.name}</p>
          {result.sizeRecommendation.dimensions && (
            <p><strong>Custom size:</strong> {result.sizeRecommendation.dimensions.length} × {result.sizeRecommendation.dimensions.width} × {result.sizeRecommendation.dimensions.height}</p>
          )}
        </div>
      )}
    </div>
  );
}
