// ===== FRONTEND: React App.jsx (Full Component) =====
import React, { useState } from 'react';
import './App.css';

export default function App() {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [quantity, setQuantity] = useState('');
  const [isHazmat, setIsHazmat] = useState(false);
  const [hazmatClass, setHazmatClass] = useState('');
  const [recommendation, setRecommendation] = useState('');

  const hazmatClasses = [
    'Class 1: Explosives',
    'Class 2: Gases',
    'Class 3: Flammable Liquids',
    'Class 4: Flammable Solids',
    'Class 5: Oxidizers & Organic Peroxides',
    'Class 6: Toxic & Infectious Substances',
    'Class 7: Radioactive Materials',
    'Class 8: Corrosives',
    'Class 9: Miscellaneous',
    'ORM-D: Other Regulated Materials – Domestic'
  ];

  const standardBoxes = [
    { label: '6x4x4 Remailer', l: 6, w: 4, h: 4 },
    { label: '8x6x4 Box', l: 8, w: 6, h: 4 },
    { label: '10x8x6 Box', l: 10, w: 8, h: 6 },
    { label: '12x10x8 Box', l: 12, w: 10, h: 8 },
    { label: '14x10x10 Box', l: 14, w: 10, h: 10 },
    { label: '16x12x10 Box', l: 16, w: 12, h: 10 }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();

    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);
    const wt = parseFloat(weight);
    const q = parseInt(quantity);

    if (isNaN(l) || isNaN(w) || isNaN(h) || isNaN(wt) || isNaN(q)) {
      setRecommendation('Please enter valid dimensions, weight, and quantity.');
      return;
    }

    const totalL = l * q;
    const totalW = w * q;
    const totalH = h * q;
    const volume = l * w * h * q;

    if (isHazmat && hazmatClass) {
      setRecommendation(`Use a USPS-compliant hazmat box for ${hazmatClass}.`);
      return;
    }

    const fittingBoxes = standardBoxes.filter(box =>
      box.l >= totalL || box.w >= totalW || box.h >= totalH
    );

    let suggestions = '';
    if (volume > 1728 || wt > 10) {
      suggestions += 'Recommended: Double-wall corrugated box.';
    } else if (volume < 100 && wt < 1) {
      suggestions += 'Recommended: Padded mailer or poly mailer.';
    } else {
      suggestions += 'Recommended: Standard single-wall carton.';
    }

    if (fittingBoxes.length > 0) {
      const boxLabels = fittingBoxes.map(box => box.label).join(', ');
      suggestions += ` Suggested sizes: ${boxLabels}.`;
    } else {
      suggestions += ' No standard box fits exactly; consider custom packaging.';
    }

    setRecommendation(suggestions);
  };

  return (
    <div className="app-container font-sans">
      <h1 className="text-3xl font-extrabold mb-4">Fosdick Packaging Tool</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div className="flex space-x-4">
          <input type="text" placeholder="Avg Item Length" className="flex-1 p-2 border rounded" value={length} onChange={(e) => setLength(e.target.value)} />
          <input type="text" placeholder="Avg Item Width" className="flex-1 p-2 border rounded" value={width} onChange={(e) => setWidth(e.target.value)} />
          <input type="text" placeholder="Avg Item Height" className="flex-1 p-2 border rounded" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>

        <div className="flex space-x-4">
          <input type="text" placeholder="Avg Item Weight (lbs)" className="flex-1 p-2 border rounded" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <input type="text" placeholder="Item Multiplier" className="flex-1 p-2 border rounded" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>

        <div>
          <label className="block font-semibold mb-1">Special Handling - Hazmat/ORMD?</label>
          <div className="flex items-center space-x-4">
            <label>
              <input type="checkbox" checked={isHazmat} onChange={(e) => setIsHazmat(e.target.checked)} className="mr-1" /> Yes
            </label>
            <label>
              <input type="checkbox" checked={!isHazmat} onChange={(e) => setIsHazmat(!e.target.checked)} className="mr-1" /> No
            </label>
          </div>
          {isHazmat && (
            <select className="mt-2 w-full p-2 border rounded" value={hazmatClass} onChange={(e) => setHazmatClass(e.target.value)}>
              <option value="">Select Hazmat/ORMD Class</option>
              {hazmatClasses.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        <button type="submit" className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
          Recommend Packaging
        </button>

        {recommendation && (
          <div className="mt-4 p-4 bg-gray-100 border rounded text-gray-800">
            {recommendation}
          </div>
        )}
      </form>
    </div>
  );
}
