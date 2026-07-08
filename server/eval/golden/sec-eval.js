const express = require('express');
const router = express.Router();

router.post('/calc', (req, res) => {
  const result = eval(req.body.expression);
  res.json({ result });
});

module.exports = router;
