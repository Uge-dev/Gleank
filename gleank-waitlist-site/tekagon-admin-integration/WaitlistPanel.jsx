import { useEffect, useState } from "react";
import {
  fetchGleankWaitlistEntries,
  fetchGleankWaitlistStats,
  getGleankWaitlistToken,
  loginGleankWaitlistAdmin,
  setGleankWaitlistToken,
} from "./waitlistApi.js";

function WaitlistPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loggedIn, setLoggedIn] = useState(Boolean(getGleankWaitlistToken()));

  async function login(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await loginGleankWaitlistAdmin(email, password);
      setGleankWaitlistToken(result.token);
      setLoggedIn(true);
      await loadData();
    } catch (err) {
      setError(err.message || "Unable to login.");
    } finally {
      setLoading(false);
    }
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [waitlistData, statsData] = await Promise.all([
        fetchGleankWaitlistEntries({ search, limit: 100 }),
        fetchGleankWaitlistStats(),
      ]);

      setEntries(waitlistData.entries || []);
      setStats(statsData);
    } catch (err) {
      setError(err.message || "Unable to load Gleank waitlist.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loggedIn) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  if (!loggedIn) {
    return (
      <form className="gleank-waitlist-panel auth" onSubmit={login}>
        <h2>Gleank Waitlist Login</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" required />
        <button disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
        {error && <p className="panel-error">{error}</p>}
      </form>
    );
  }

  return (
    <section className="gleank-waitlist-panel">
      <div className="panel-head">
        <div>
          <p>Gleank</p>
          <h2>Waitlist Data</h2>
        </div>
        <strong>{stats?.total || 0} total</strong>
      </div>

      <div className="panel-filter">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search waitlist..." />
        <button onClick={loadData} disabled={loading}>{loading ? "Loading..." : "Search"}</button>
      </div>

      {error && <p className="panel-error">{error}</p>}

      <div className="panel-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>WhatsApp</th>
              <th>Campus</th>
              <th>Role</th>
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
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default WaitlistPanel;
