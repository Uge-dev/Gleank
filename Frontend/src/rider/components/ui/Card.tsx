import type { ReactNode } from 'react';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass-card rounded-[1.6rem] shadow-card ${className}`}>
      {children}
    </div>
  );
}
