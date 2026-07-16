const jwt = require("jsonwebtoken");

// 【2026-07-15】游客访问已整体关闭（华哥要求：仅 admin 与郑蔼平可访问）。
// auth 是所有受保护接口的必经之路（adminAuth/strictAdminAuth/staffAuth 等内部都会调用它），
// 在此直接拒绝一切 guest 令牌——包括关闭前已签发、仍在 12 小时有效期内的历史令牌。
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "未授权" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Token无效" });
  }
  if (req.user.role === "guest") {
    return res.status(403).json({ error: "游客访问已关闭，请使用账号登录" });
  }
  next();
};

// 管理员权限（已开放给教练/领队，与 admin 全站同权）
const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    const allowed = ["admin", "管理员", "coach", "team_lead", "教练", "领队"];
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).json({ error: "需要管理员权限" });
  });
};

// 严格管理员权限：仅 role=admin，不能被教练/领队的后台同权规则放宽。
const strictAdminAuth = (req, res, next) => {
  auth(req, res, () => {
    if (req.user?.role === "admin") return next();
    return res.status(403).json({ error: "仅 Admin 可访问" });
  });
};

// 赛训组权限：admin/管理员/教练/领队/经理/CEO
const staffAuth = (req, res, next) => {
  auth(req, res, () => {
    const allowed = ["admin", "管理员", "coach", "team_lead", "manager", "ceo", "教练", "领队", "经理"];
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).json({ error: "需要赛训组权限" });
  });
};

// 教练权限
const coachAuth = (req, res, next) => {
  auth(req, res, () => {
    const allowed = ["admin", "管理员", "coach", "教练", "manager", "ceo", "经理"];
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).json({ error: "需要教练权限" });
  });
};

// 领队权限
const leadAuth = (req, res, next) => {
  auth(req, res, () => {
    const allowed = ["admin", "管理员", "team_lead", "领队", "manager", "ceo", "经理"];
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).json({ error: "需要领队权限" });
  });
};

module.exports = { auth, adminAuth, strictAdminAuth, staffAuth, coachAuth, leadAuth };
