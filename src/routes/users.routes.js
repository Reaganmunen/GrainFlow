// Mounted at the API root: serves /users and /roles
const router = require('express').Router();
const { users } = require('../controllers');
const { permit } = require('./guards');
const { ownerOnly } = require('../middlewares/moduleScope');

// users
router.get('/users', ownerOnly, permit('users.view'), users.list);
router.post('/users', ownerOnly, permit('users.create'), users.create);
router.get('/users/:id', ownerOnly, permit('users.view'), users.get);
router.put('/users/:id', ownerOnly, permit('users.update'), users.update);
router.put('/users/:id/password', ownerOnly, permit('users.reset_password'), users.resetPassword);
router.post('/users/:id/unlock', ownerOnly, permit('users.unlock'), users.unlock);

// roles (static paths first)
router.get('/roles', ownerOnly, permit('roles.view'), users.roles);
router.get('/roles/permissions', ownerOnly, permit('roles.view'), users.permissions);
router.get('/roles/:id', ownerOnly, permit('roles.view'), users.role);
router.put('/roles/:id/permissions', ownerOnly, permit('roles.manage'), users.setRolePermissions);

module.exports = router;
