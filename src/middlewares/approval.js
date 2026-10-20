const AppError = require('../utils/AppError');
const { User } = require('../models');
const asyncHandler = require('./asyncHandler');

/**
 * Manager approval at the till ("manager PIN" flow) for actions such as price.override, sales.void, payments.reverse.
 *  - If the logged-in user already has the permission, they approve themselves.
 *  - Otherwise the request body must carry approver_username + approver_password of someone who has it.
 * Sets req.approverId (use it as approver_id / price_override_by) and removes the password from req.body.
 *
 *   router.post('/:id/void', requirePermission('sales.create'), requireApproval('sales.void'), ctrl.void)
 */
const requireApproval = (permission) =>
  asyncHandler(async (req, res, next) => {
    if (req.can(permission)) {
      req.approverId = req.user.id;
      return next();
    }
    const { approver_username, approver_password } = req.body || {};
    if (req.body) delete req.body.approver_password; // never let it travel further (logs, models)
    if (!approver_username || !approver_password) {
      throw new AppError('Manager approval is required for this action', 403, { code: 'APPROVAL_REQUIRED', permission });
    }
    const approver = await User.authenticate(approver_username, approver_password); // handles lockout; 401 if wrong
    if (!approver.permissions.includes(permission)) {
      throw new AppError('That user is not allowed to approve this action', 403, { code: 'APPROVER_NOT_ALLOWED', permission });
    }
    req.approverId = approver.id;
    next();
  });

module.exports = { requireApproval };
