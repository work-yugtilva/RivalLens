import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
