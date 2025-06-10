const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/recommend-packaging', (req, res) => {
  const { length, width, height, quantity, fragility } = req.body;

  const volumePerItem = length * width * height;
  const totalVolume = volumePerItem * quantity;

  let material;
  if (fragility === 'high') {
    material = 'Double Wall Carton or Padded Mailer';
  } else if (fragility === 'medium') {
    material = 'Single Wall Carton or Poly Mailer';
  } else {
    material = totalVolume < 300 ? 'Poly Mailer' : 'Single Wall Carton';
  }

  const standardBoxes = [
    { name: '6x6x6', length: 6, width: 6, height: 6 },
    { name: '10x8x4', length: 10, width: 8, height: 4 },
    { name: '12x12x8', length: 12, width: 12, height: 8 },
    { name: '14x10x10', length: 14, width: 10, height: 10 }
  ];

  function fitsBox(box) {
    const boxVolume = box.length * box.width * box.height;
    return (
      box.length >= length &&
      box.width >= width &&
      box.height >= height &&
      boxVolume >= totalVolume
    );
  }

  const fittingBoxes = standardBoxes.filter(fitsBox);
  const sizeRecommendation =
    fittingBoxes.length > 0
      ? fittingBoxes[0]
      : {
          name: 'Custom',
          dimensions: {
            length: length * quantity,
            width,
            height
          }
        };

  res.json({
    materialRecommendation: material,
    sizeRecommendation
  });
});

app.listen(PORT, () => {
  console.log(`Packaging API listening on port ${PORT}`);
});