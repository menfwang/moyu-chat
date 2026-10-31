import { Check } from 'lucide-react';

export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast${message ? ' is-visible' : ''}`} role="status" aria-live="polite">
      <Check size={15} />
      <span>{message ?? ''}</span>
    </div>
  );
}
