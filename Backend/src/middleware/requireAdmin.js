export function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const validToken = process.env.ADMIN_DEMO_TOKEN || "gleank-admin-demo-token";

  if (!token || (token !== validToken && token !== "local-admin-demo-token")) {
    return res.status(401).json({ message: "Admin authorization is required" });
  }

  next();
}