export default function SkeletonCard() {
  return (
    <div className="rounded-[1.6rem] border border-slate-100 bg-white p-5 shadow-card">
      <div className="skeleton-shimmer h-5 w-2/5 rounded-full bg-slate-100" />
      <div className="mt-4 grid gap-3">
        <div className="skeleton-shimmer h-4 rounded-full bg-slate-100" />
        <div className="skeleton-shimmer h-4 w-4/5 rounded-full bg-slate-100" />
        <div className="skeleton-shimmer h-10 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}
