// Mounted at the API root: serves /users and /roles
const router = require('express').Router();
const { users } = require('../controllers');
const { permit } = require('./guards');

// users
router.get('/users', permit('users.view'), users.list);
router.post('/users', permit('users.create'), users.create);
router.get('/users/:id', permit('users.view'), users.get);
router.put('/users/:id', permit('users.update'), users.update);
router.put('/users/:id/password', permit('users.reset_password'), users.resetPassword);
router.post('/users/:id/unlock', permit('users.unlock'), users.unlock);

// roles (static paths first)
router.get('/roles', permit('roles.view'), users.roles);
router.get('/roles/permissions', permit('roles.view'), users.permissions);
router.get('/roles/:id', permit('roles.view'), users.role);
router.put('/roles/:id/permissions', permit('roles.manage'), users.setRolePermissions);

module.exports = router;
