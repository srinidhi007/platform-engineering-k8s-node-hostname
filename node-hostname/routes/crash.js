var express = require('express');
var router = express.Router();
var os = require('os');

// routes/crash.js
router.get('/', (req, res, next) => next(new Error('something bad happened')));


module.exports = router;
