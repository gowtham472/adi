/**
 * The ADI mark: a changed resource, in orange, and the dependency edges its change travels
 * along. Rings are filled with the surface colour so edges end at the ring, not inside it.
 */
export function LogoMark({ className }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="-7 -7 32 44" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="3" strokeLinecap="round">
        <path d="M18 15V30H0" stroke="var(--logo-ring)" />
        <path d="M0 0V30M0 15H18" stroke="var(--accent)" />
      </g>
      <g fill="var(--logo-fill)" stroke="var(--logo-ring)" strokeWidth="3">
        <circle cx="0" cy="0" r="4.5" />
        <circle cx="18" cy="15" r="4.5" />
        <circle cx="0" cy="30" r="4.5" />
        <circle cx="18" cy="30" r="4.5" />
      </g>
      <circle cx="0" cy="15" r="6" fill="var(--accent)" />
    </svg>
  );
}
