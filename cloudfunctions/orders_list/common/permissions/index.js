const ROLE_MAP = {
  0: 'admin',
  1: 'user',
  2: 'designer',
}

function getRole(identity) {
  const user = identity && identity.user ? identity.user : {}
  if (user.role === 'admin' || user.role === 'designer' || user.role === 'user') {
    return user.role
  }

  if (typeof user.roles === 'number' && ROLE_MAP[user.roles]) {
    return ROLE_MAP[user.roles]
  }

  return 'user'
}

function requireAuthenticated(identityResult) {
  if (!identityResult || !identityResult.ok) {
    return {
      ok: false,
      code: identityResult && identityResult.code ? identityResult.code : 'UNAUTHENTICATED',
      errorMessage: identityResult && identityResult.errorMessage ? identityResult.errorMessage : 'Unauthenticated',
    }
  }

  if (!identityResult.identity || !identityResult.identity.userId) {
    return { ok: false, code: 'UNAUTHENTICATED', errorMessage: 'Unauthenticated' }
  }

  return { ok: true, identity: identityResult.identity }
}

function requireRole(identity, allowedRoles) {
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  const role = getRole(identity)
  if (!allowed.includes(role)) {
    return { ok: false, code: 'FORBIDDEN', errorMessage: 'Forbidden' }
  }
  return { ok: true, role }
}

function isDesigner(identity) {
  return getRole(identity) === 'designer'
}

function isAdmin(identity) {
  return getRole(identity) === 'admin'
}

module.exports = {
  getRole,
  requireAuthenticated,
  requireRole,
  isDesigner,
  isAdmin,
}
