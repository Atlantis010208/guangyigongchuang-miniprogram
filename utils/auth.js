function getRole(user) {
  if (!user || typeof user.roles !== 'number') return 1
  return user.roles
}

function isAdmin(user) {
  return getRole(user) === 0
}

function isDesigner(user) {
  return getRole(user) === 2
}

module.exports = { getRole, isAdmin, isDesigner }

