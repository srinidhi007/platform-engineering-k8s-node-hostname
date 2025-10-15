// app.js
const createError = require('http-errors');
const express = require('express');
const logger = require('morgan');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const crashRouter = require('./routes/crash');

const app = express();

// Ensure version is available even when not started via `npm start`
try {
  if (!process.env.npm_package_version) {
    process.env.npm_package_version = require('./package.json').version;
  }
} catch (_) { /* ignore if package.json missing */ }

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Lightweight health endpoints for probes
app.get('/healthz', (req, res) => res.send('ok'));
app.get('/readyz',  (req, res) => res.send('ready'));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/crash', crashRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => next(createError(404)));

// JSON error handler (no view engine required)
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const payload = {
    error: {
      message: err.message,
      status,
    },
  };
  // only include stack in development
  if (req.app.get('env') === 'development' && err.stack) {
    payload.error.stack = err.stack;
  }
  res.status(status).json(payload);
});

module.exports = app;

