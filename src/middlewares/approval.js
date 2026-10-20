const AppError = require('../utils/AppError');
const { User } = require('../models');
const asyncHandler = require('./asyncHandler');

async function resolveApprover(req, permission) {
  if (req.can(permission)) return req.user.id; // the logged-in user can approve themselves
  const { approver_username, approver_password } = req.body || {};
  if (req.body) delete req.body.approver_password; // never let it travel further (logs, models)
  if (!approver_username || !approver_password) return null;
  const approver = await User.authenticate(approver_username, approver_password); // lockout + 401 if wrong
  if (!approver.permissions.includes(permission)) {
    throw new AppError('That user is not allowed to approve this action', 403, { code: 'APPROVER_NOT_ALLOWED', permission });
  }
  return approver.id;
}

/**
 * Manager approval at the till ("manager PIN" flow) for price.override, sales.void, payments.reverse...
 *  - If the logged-in user already has the permission, they approve themselves.
 *  - Otherwise the body must carry approver_username + approver_password of someone who has it.
 * Sets req.approverId (use as approver_id / price_override_by).
 */
const requireApproval = (permission) =>
  asyncHandler(async (req, res, next) => {
    const id = await resolveApprover(req, permission);
    if (!id) throw new AppError('Manager approval is required for this action', 403, { code: 'APPROVAL_REQUIRED', permission });
    req.approverId = id;
    next();
  });

/**
 * Same check but approval is optional: req.approverId is set only if the user can approve themselves or valid approver
 * credentials were sent. Used for price overrides: the DB itself rejects a below-minimum price when nobody approved.
 */
const optionalApproval = (permission) =>
  asyncHandler(async (req, res, next) => {
    const id = await resolveApprover(req, permission);
    if (id) req.approverId = id;
    next();
  });

module.exports = { requireApproval, optionalApproval };