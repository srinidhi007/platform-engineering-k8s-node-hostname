var express = require('express');
var router = express.Router();
var os = require('os');

// routes/index.js
const { version } = require('../package.json');
router.get('/', (req, res) => res.send({ hostname: os.hostname(), version }));

// in routes/index.js
router.get('/healthz', (req, res) => res.send('ok'));
router.get('/readyz',  (req, res) => res.send('ready'));

module.exports = router;
