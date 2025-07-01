// ===== BACKEND: Express API (index.js) =====
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const standardPackages = [
  { type: 'Padded Mailer', maxVolume: 100, maxWeight: 1, dimensions: '6x9' },
  { type: 'Poly Mailer', maxVolume: 300, maxWeight: 3, dimensions: '9x12' },
  { type: 'Single-Wall Carton', maxVolume: 1000, maxWeight: 10, dimensions: '12x9x4' },
  { type: 'Double-Wall Carton', maxVolume: 3000, maxWeight: 30, dimensions: '16x12x12' },
  { type: 'Oversize Carton', maxVolume: 6000, maxWeight: 70, dimensions: '24x18x18' }
];

const hazmatRules = {
  'Class 3': 'Flammable liquids must use leak-proof secondary containment and strong outer fiberboard box.',
  'Class 8': 'Corrosives require chemically resistant inner packaging and double-wall cartons.',
  'ORM-D': 'ORM-D items require durable outer packaging with clear ORMD labeling.',
  // Add more USPS-compliant rules as needed
};

app.post('/recommend', (req, res) => {
  const { length, width, height, weight, quantity, hazmat, hazmatClass } = req.body;
  const l = parseFloat(length);
  const w = parseFloat(width);
  const h = parseFloat(height);
  const wt = parseFloat(weight);
  const qty = parseInt(quantity);

  if (isNaN(l) || isNaN(w) || isNaN(h) || isNaN(wt) || isNaN(qty)) {
    return res.status(400).json({ error: 'Invalid inputs' });
  }

  const totalVolume = l * w * h * qty;
  const totalWeight = wt * qty;

  if (hazmat && hazmatClass) {
    const hazmatNote = hazmatRules[hazmatClass] || `Handle ${hazmatClass} using USPS hazmat guidelines.`;
    return res.json({
      recommendation: `Hazmat Packaging Required: ${hazmatNote}`
    });
  }

  const matched = standardPackages.find(pkg => {
    return totalVolume <= pkg.maxVolume && totalWeight <= pkg.maxWeight;
  });

  if (matched) {
    res.json({
      recommendation: `Recommended: ${matched.type} (${matched.dimensions})`
    });
  } else {
    res.json({
      recommendation: 'Use a custom heavy-duty carton or consult fulfillment specialist.'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));


// ===== FRONTEND: React (App.jsx submit handler only) =====
const handleSubmit = async (e) => {
  e.preventDefault();

  const payload = {
    length,
    width,
    height,
    weight,
    quantity,
    hazmat: isHazmat,
    hazmatClass,
  };

  try {
    const res = await fetch('https://fosdick-packaging-api.onrender.com/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setRecommendation(data.recommendation);
  } catch (err) {
    setRecommendation('Error fetching recommendation.');
  }
};
