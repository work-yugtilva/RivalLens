/**
 * Icons transcribed from the approved Direction A HTML in docs/design/final/.
 * The paths are reproduced exactly; only sizing and stroke colour are props.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  viewBox = '0 0 16 16',
  strokeWidth = 1.4,
  children,
  ...props
}: IconProps & { viewBox?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function WordmarkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.4 10.4L14 14" />
    </Icon>
  );
}

export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M5.2 6.2h5.6M5.2 9h3.4" />
    </Icon>
  );
}

export function RivalsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.2" y="4.2" width="7" height="7" rx="1.6" />
      <path d="M6.8 4.2V3.4a1.2 1.2 0 011.2-1.2h4.4a1.2 1.2 0 011.2 1.2v6.2a1.2 1.2 0 01-1.2 1.2h-.6" />
    </Icon>
  );
}

export function CompareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.6 5.6h10.8M11 3.2l2.4 2.4L11 8M13.4 10.4H2.6M5 8l-2.4 2.4L5 12.8" />
    </Icon>
  );
}

export function OpportunitiesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.4 2.2v4L3 11.4a1.6 1.6 0 001.35 2.4h7.3A1.6 1.6 0 0013 11.4L9.6 6.2v-4M5.4 2.2h5.2M4.7 9.4h6.6" />
    </Icon>
  );
}

export function EvidenceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.4" y="2.4" width="11.2" height="4" rx="1.2" />
      <rect x="2.4" y="9.6" width="11.2" height="4" rx="1.2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.4 4.6h11.2M2.4 11.4h11.2" />
      <circle cx="6" cy="4.6" r="1.7" />
      <circle cx="10.4" cy="11.4" r="1.7" />
    </Icon>
  );
}

export function ChevronDownIcon({ size = 10, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 10 10" strokeWidth={1.3} {...props}>
      <path d="M2.5 4L5 6.5L7.5 4" />
    </Icon>
  );
}

export function ChevronRightIcon({ size = 11, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 12 12" strokeWidth={1.5} {...props}>
      <path d="M4.4 2.6L7.8 6l-3.4 3.4" />
    </Icon>
  );
}

export function CompleteIcon({ size = 12, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 12 12" strokeWidth={1.6} {...props}>
      <path d="M2.2 6.3l2.6 2.6L9.8 3.6" />
    </Icon>
  );
}

export function PartialIcon({ size = 12, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 12 12" strokeWidth={1.5} {...props}>
      <circle cx="6" cy="6" r="4.4" />
      <path d="M6 3.4V6.4" />
    </Icon>
  );
}

export function RegenerateIcon({ size = 13, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 14 14" {...props}>
      <path d="M12.2 7a5.2 5.2 0 11-1.6-3.75M12.4 1.6v3.2H9.2" />
    </Icon>
  );
}

export function DeltaDownIcon({ size = 9, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 10 10" strokeWidth={1.6} {...props}>
      <path d="M5 2v6M2.4 5.6L5 8.2l2.6-2.6" />
    </Icon>
  );
}

export function DeltaUpIcon({ size = 9, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 10 10" strokeWidth={1.6} {...props}>
      <path d="M5 8V2M2.4 4.4L5 1.8l2.6 2.6" />
    </Icon>
  );
}

export function CloseIcon({ size = 13, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 14 14" strokeWidth={1.5} {...props}>
      <path d="M3.4 3.4l7.2 7.2M10.6 3.4l-7.2 7.2" />
    </Icon>
  );
}

export function NoticeIcon({ size = 15, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 14 14" {...props}>
      <circle cx="7" cy="7" r="5.2" />
      <path d="M7 4.2v3.4M7 9.6v.1" />
    </Icon>
  );
}

export function ErrorIcon({ size = 16, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 16 16" {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8v3.6M8 10.9v.1" />
    </Icon>
  );
}

export function EmptyReportIcon({ size = 22, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 24 24" strokeWidth={1.3} {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h5" />
    </Icon>
  );
}

export function MenuIcon({ size = 18, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 18 18" strokeWidth={1.5} {...props}>
      <path d="M3 5.2h12M3 9h12M3 12.8h12" />
    </Icon>
  );
}

export function MobileRefreshIcon({ size = 17, ...props }: IconProps) {
  return (
    <Icon size={size} viewBox="0 0 18 18" strokeWidth={1.5} {...props}>
      <path d="M15.6 9a6.6 6.6 0 11-2-4.75M15.8 2.4v3.9h-3.9" />
    </Icon>
  );
}
