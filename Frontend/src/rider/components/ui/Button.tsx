import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { IconType } from 'react-icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconType;
  fullWidth?: boolean;
}

const variants = {
  primary: 'bg-gleenc-gradient text-gleenc-dark shadow-glow hover:shadow-soft',
  secondary: 'bg-white text-slate-800 border border-slate-200 hover:border-gleenc-cyan hover:bg-cyan-50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  danger: 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100',
  dark: 'bg-slate-950 text-white hover:bg-slate-800'
};

const sizes = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base'
};

export default function Button({ children, variant = 'primary', size = 'md', icon: Icon, fullWidth, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {Icon && <Icon className="text-lg" />}
      {children}
    </button>
  );
}
