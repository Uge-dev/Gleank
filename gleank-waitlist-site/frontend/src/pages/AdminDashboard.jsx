import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearAdminToken,
  downloadWaitlistCsv,
  fetchWaitlist,
  fetchWaitlistStats,
  updateWaitlistEntry,
} from "../services/api.js";

function AdminDashboard() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [userType, setUserType] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [waitlistData, statsData] = await Promise.all([
        fetchWaitlist({ search, userType, status, limit: 200 }),
        fetchWaitlistStats(),
      ]);

      setEntries(waitlistData.entries || []);
      setStats(statsData);
    } catch (err) {
      setError(err.message || "Unable to load waitlist data.");
      if (String(err.message || "").toLowerCase().includes("token")) {
        clearAdminToken();
        navigate("/admin-login");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userType, status]);

  const roleStats = useMemo(() => {
    const result = { buyer: 0, seller: 0, service_provider: 0, rider: 0 };
    for (const item of stats?.byType || []) result[item._id] = item.count;
    return result;
  }, [stats]);

  async function handleStatusChange(id, nextStatus) {
    try {
      const result = await updateWaitlistEntry(id, { status: nextStatus });
      setEntries((current) => current.map((item) => item._id === id ? result.entry : item));
    } catch (err) {
      alert(err.message || "Unable to update status.");
    }
  }

  function logout() {
    clearAdminToken();
    navigate("/admin-login");
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p>Gleank</p>
          <h1>Waitlist Dashboard</h1>
        </div>
        <div className="admin-actions">
          <button onClick={downloadWaitlistCsv}>Export CSV</button>
          <button className="ghost-button" onClick={logout}>Logout</button>
        </div>
      </header>

      <section className="stats-grid">
        <article><span>Total</span><strong>{stats?.total || 0}</strong></article>
        <article><span>Buyers</span><strong>{roleStats.buyer}</strong></article>
        <article><span>Sellers</span><strong>{roleStats.seller}</strong></article>
        <article><span>Service providers</span><strong>{roleStats.service_provider}</strong></article>
        <article><span>Riders</span><strong>{roleStats.rider}</strong></article>
      </section>

      <section className="admin-panel">
        <div className="filter-row">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, WhatsApp, campus..." />
          <select value={userType} onChange={(e) => setUserType(e.target.value)}>
            <option value="">All roles</option>
            <option value="buyer">Buyer</option>
            <option value="seller">Seller</option>
            <option value="service_provider">Service provider</option>
            <option value="rider">Dispatch rider</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="converted">Converted</option>
            <option value="ignored">Ignored</option>
          </select>
          <button onClick={loadData}>Search</button>
        </div>

        {error && <p className="form-message error">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading waitlist data...</p>
        ) : entries.length === 0 ? (
          <p className="empty-state">No waitlist data found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>Campus</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry._id}>
                    <td>{entry.name}</td>
                    <td>{entry.email}</td>
                    <td>{entry.whatsapp}</td>
                    <td>{entry.campus || "—"}</td>
                    <td>{entry.userType?.replace("_", " ")}</td>
                    <td>
                      <select value={entry.status} onChange={(e) => handleStatusChange(entry._id, e.target.value)}>
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="converted">Converted</option>
                        <option value="ignored">Ignored</option>
                      </select>
                    </td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default AdminDashboard;
