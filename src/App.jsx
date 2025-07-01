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

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    const body = {
      length: +form.length,
      width: +form.width,
      height: +form.height,
      weight: +form.weight,
      quantity: +form.quantity,
      hazmat: form.hazmat,
      hazmatClass: form.hazmat === 'yes' ? form.hazmatClass : null,
    };
    try {
      const res = await fetch('https://fosdick-packaging-api.onrender.com/recommend-packaging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setResult(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 600,
        margin: 'auto',
        padding: 20,
        fontFamily: '"Open Sans", sans-serif',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <h2 style={{ fontWeight: 800, fontSize: 24 }}>📦 Fosdick Packaging Tool</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 15 }}>
        {/* Dimension inputs */}
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            name="length"
            type="number"
            placeholder="Avg Item Length"
            value={form.length}
            onChange={handleChange}
            style={{ flex: 1, padding: 8 }}
            required
          />
          <input
            name="width"
            type="number"
            pl
