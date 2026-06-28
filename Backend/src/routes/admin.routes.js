import { Router } from "express";
import { deleteRecord, getAdminDataset, resetAdminDataset, updateRecordFields, updateRecordStatus } from "../data/adminStore.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || "admin@gleank.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
  const token = process.env.ADMIN_DEMO_TOKEN || "gleank-admin-demo-token";

  if (String(email).toLowerCase().trim() !== adminEmail || String(password).trim() !== adminPassword) {
    return res.status(401).json({ message: "Invalid admin login details" });
  }

  res.json({
    token,
    admin: {
      name: "Gleank Admin",
      email: adminEmail,
      role: "admin",
    },
  });
});

router.get("/overview", requireAdmin, (_req, res) => {
  res.json(getAdminDataset());
});

router.patch("/:collection/:id/status", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const { status, field = "status" } = req.body || {};

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const data = updateRecordStatus(collection, id, status, field);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not update admin record" });
  }
});


router.patch("/:collection/:id", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const fields = req.body || {};

    if (!fields || Object.keys(fields).length === 0) {
      return res.status(400).json({ message: "Update fields are required" });
    }

    const data = updateRecordFields(collection, id, fields);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not update admin record" });
  }
});

router.delete("/:collection/:id", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const data = deleteRecord(collection, id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not delete admin record" });
  }
});

router.post("/reset", requireAdmin, (_req, res) => {
  res.json({ success: true, data: resetAdminDataset() });
});

export default router;