function ok(data, meta) {
  return {
    success: true,
    code: 'OK',
    data,
    timestamp: Date.now(),
    ...(meta && typeof meta === 'object' ? meta : {}),
  }
}

function fail(code, errorMessage, extra) {
  return {
    success: false,
    code: code || 'UNKNOWN_ERROR',
    errorMessage: errorMessage || 'Operation failed',
    timestamp: Date.now(),
    ...(extra && typeof extra === 'object' ? extra : {}),
  }
}

function fromError(error, fallbackCode) {
  const message = error && error.message ? error.message : 'Operation failed'
  return fail(fallbackCode || 'UNKNOWN_ERROR', message)
}

module.exports = {
  ok,
  fail,
  fromError,
}
