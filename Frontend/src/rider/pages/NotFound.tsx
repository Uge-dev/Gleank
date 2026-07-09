import { Link } from 'react-router-dom';
import Button from '../components/ui/Button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gleenc-soft p-4 text-center">
      <div className="max-w-md rounded-[2rem] bg-white p-8 shadow-soft">
        <h1 className="text-5xl font-black text-slate-950">404</h1>
        <p className="mt-3 text-slate-500">This page could not be found.</p>
        <Link to="/rider" className="mt-6 inline-flex"><Button>Back to Dashboard</Button></Link>
      </div>
    </main>
  );
}
