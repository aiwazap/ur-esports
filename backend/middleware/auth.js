const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "未授权" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token无效" });
  }
};

// 管理员权限（已开放给教练/领队，与 admin 全站同权）
const adminAuth = (req, res, next) => {
  auth(req, res, () => {
    const allowed = ["admin", "管理员", "coach", "team_lead", "教练", "领队"];
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).json({ error: "需要管理员权限" });
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

module.exports = { auth, adminAuth, staffAuth, coachAuth, leadAuth };
