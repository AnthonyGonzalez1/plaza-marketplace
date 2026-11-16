import type { ReactNode } from 'react';

interface StatusMessageProps {
  title: string;
  hint: string;
  /** Heading level: "h1" when the message is the whole page, "h2" inside a page. */
  heading?: 'h1' | 'h2';
  /** Use "alert" for errors so screen readers announce them immediately. */
  role?: 'alert' | 'status';
  /** Optional action below the text: a retry button, a link back, etc. */
  children?: ReactNode;
}

/** Centered message used for the empty, error and not-found states. */
export function StatusMessage({
  title,
  hint,
  heading: Heading = 'h2',
  role,
  children,
}: StatusMessageProps) {
  return (
    <div className="status-message" role={role}>
      <Heading className="status-message__title">{title}</Heading>
      <p className="status-message__hint">{hint}</p>
      {children}
    </div>
  );
}
