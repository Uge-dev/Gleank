export function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== "admin") {
    return res.status(401).json({ message: "Admin authorization is required" });
  }

  next();
}
