// 共享小件：图标 / 徽章 / 开关 / 按钮 / 下拉 / 模态壳 — design.md §4–§6
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ReactNode, SVGProps } from 'react';

// ---------- 路径小工具 ----------

export function basename(p: string): string {
  const t = p.replace(/\/+$/, '');
  const i = t.lastIndexOf('/');
  return i >= 0 ? t.slice(i + 1) : t;
}

export function shortenPath(p: string, home: string): string {
  return home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

// ---------- 图标（Lucide 风格手写细线，stroke 1.5，viewBox 24） ----------

type IconProps = SVGProps<SVGSVGElement>;

function Svg(props: IconProps) {
  const { children, ...rest } = props;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </Svg>
);

export const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </Svg>
);

export const IconFile = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </Svg>
);

export const IconArchive = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const IconChevronsUpDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m7 9 5-5 5 5" />
    <path d="m7 15 5 5 5-5" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h5v5" />
    <path d="M20 4 11 13" />
    <path d="M18 13v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H11" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.1 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12.5 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </Svg>
);

export const IconTerminal = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="m7 9 3 2.5L7 14" />
    <path d="M12 14h5" />
    <path d="M8 21h8" />
  </Svg>
);

export const IconCode = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 7-5 5 5 5" />
    <path d="m16 7 5 5-5 5" />
    <path d="m13.5 4-3 16" />
  </Svg>
);

export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.32-1.33" />
  </Svg>
);


export const IconPanelLeft = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Svg>
);

export const IconBox = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
    <path d="M4 7.5 12 12l8-4.5" />
    <path d="M12 12v9" />
  </Svg>
);

export const IconGear = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09c0-.69-.41-1.3-1.04-1.56a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09c.69 0 1.3-.41 1.56-1.04a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06c.5.49 1.23.62 1.87.34.63-.26 1.04-.87 1.04-1.56V3a2 2 0 1 1 4 0v.09c0 .69.41 1.3 1.03 1.56.64.28 1.38.15 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87c.26.63.87 1.04 1.56 1.04H21a2 2 0 1 1 0 4h-.09c-.69 0-1.3.41-1.51 1.03Z" />
  </Svg>
);

// ---------- Badge（design.md §4.6） ----------

export type BadgeVariant = 'warning' | 'accent' | 'gray' | 'outline';

const BADGE_CLS: Record<BadgeVariant, string> = {
  warning: 'bg-warning-soft text-warning',
  accent: 'bg-accent-soft text-accent',
  gray: 'bg-selected text-ink-2',
  outline: 'border border-border bg-app text-ink-2',
};

export function Badge({ variant = 'outline', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[10px] font-medium leading-[1.4] ${BADGE_CLS[variant]}`}
    >
      {children}
    </span>
  );
}

// ---------- Toggle（design.md §4.4，role=switch） ----------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  small,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  small?: boolean;
}) {
  const common = {
    type: 'button' as const,
    role: 'switch',
    'aria-checked': checked,
    'aria-label': label,
    disabled,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(!checked);
    },
  };

  if (small) {
    return (
      <button
        {...common}
        className={`hit-extend relative h-3.5 w-6 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-strong disabled:cursor-default disabled:opacity-50 ${
          checked ? 'bg-accent' : 'bg-toggle-off'
        }`}
      >
        <span
          className={`absolute left-[2px] top-[2px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-strong ${
            checked ? 'translate-x-2.5' : 'translate-x-0'
          }`}
        />
      </button>
    );
  }

  // 状态图标开关：开启露出 ✓（蓝轨道），关闭露出 ✗（灰轨道）——颜色之外的第二信号
  return (
    <button
      {...common}
      className={`hit-extend relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-strong disabled:cursor-default disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-toggle-off'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-[5px] top-1/2 -translate-y-1/2 transition-colors duration-200 ${
          checked ? 'text-white' : 'text-transparent'
        }`}
      >
        <IconCheck className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute right-[5px] top-1/2 -translate-y-1/2 transition-colors duration-200 ${
          checked ? 'text-transparent' : 'text-ink-3'
        }`}
      >
        <IconX className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <span
        className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ---------- Checkbox（批量模式行复选框） ----------

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`hit-extend flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors duration-150 ${
        checked ? 'border-accent bg-accent' : 'border-border bg-app hover:bg-hover'
      }`}
    >
      {checked && <IconCheck className="h-3 w-3 text-white" strokeWidth={2.5} />}
    </button>
  );
}

// ---------- IconButton ----------

export function IconButton({
  label,
  onClick,
  danger,
  disabled,
  title,
  children,
}: {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`hit-extend pressable flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-default disabled:opacity-40 ${
        danger ? 'text-warning hover:bg-warning-soft' : 'text-ink-2 hover:bg-selected'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Button（design.md §4.7） ----------

export type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'dangerSolid';

const BUTTON_CLS: Record<ButtonVariant, string> = {
  secondary: 'border border-border bg-app text-ink hover:bg-hover',
  primary: 'bg-accent text-white hover:bg-accent/90',
  danger: 'text-warning hover:bg-warning-soft',
  dangerSolid: 'bg-warning text-white hover:bg-warning/90',
};

export function Button({
  variant = 'secondary',
  onClick,
  disabled,
  compact,
  children,
}: {
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`pressable inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium disabled:cursor-default disabled:opacity-40 ${
        compact ? 'h-[26px]' : 'h-7'
      } ${BUTTON_CLS[variant]}`}
    >
      {children}
    </button>
  );
}

// ---------- ViewScroll：头部固定、仅内容滚动；内容列恒定宽度居中（侧栏收起时不变宽） ----------

export function ViewScroll({
  header,
  bottomPad,
  children,
}: {
  header: ReactNode;
  /** 底部留白（如批量条需要 pb-28） */
  bottomPad?: string;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <div
        className={`shrink-0 border-b px-6 pb-3 pt-5 transition-colors duration-150 ${
          scrolled ? 'border-divider' : 'border-transparent'
        }`}
      >
        <div className="mx-auto w-full max-w-[720px]">{header}</div>
      </div>
      <div
        className={`min-h-0 flex-1 overflow-y-auto px-6 ${bottomPad ?? 'pb-16'}`}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
      >
        <div className="mx-auto w-full max-w-[720px] pt-1">{children}</div>
      </div>
    </div>
  );
}

// ---------- Segmented（macOS 分段控件：灰底轨道 + 白色活动段） ----------

export function Segmented({
  items,
  active,
  onSelect,
  ariaLabel,
}: {
  items: string[];
  active: number;
  onSelect: (i: number) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 rounded-[8px] bg-inset p-[3px]"
    >
      {items.map((label, i) => (
        <button
          key={label}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => onSelect(i)}
          className={`relative h-[26px] cursor-pointer rounded-[6px] px-3 text-[12px] transition-colors duration-150 ${
            i === active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {i === active && (
            <motion.span
              layoutId={`seg-${ariaLabel}`}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
              className="absolute inset-0 -z-10 rounded-[6px] bg-app shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
            />
          )}
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------- Spinner ----------

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin-fast ${className ?? 'h-3.5 w-3.5'}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Dropdown（macOS 选择器气质，design.md §4.5 浮层） ----------

export interface DropdownItem<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export function Dropdown<T extends string>({
  value,
  items,
  onSelect,
  ariaLabel,
  buttonLabel,
  compact,
  alignRight,
  menuWidth,
}: {
  value: T;
  items: DropdownItem<T>[];
  onSelect: (v: T) => void;
  ariaLabel: string;
  /** 自定义按钮文案（默认显示当前项 label） */
  buttonLabel?: string;
  compact?: boolean;
  alignRight?: boolean;
  menuWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = items.find((i) => i.value === value);

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={`flex cursor-pointer items-center gap-1.5 rounded-control border border-border bg-app px-2 text-[12px] text-ink transition-colors duration-150 hover:bg-hover ${
          compact ? 'h-[26px]' : 'h-[27px]'
        }`}
      >
        {buttonLabel ?? current?.label}
        <IconChevronsUpDown className="h-3.5 w-3.5 text-ink-3" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`pop-in absolute z-40 mt-1 ${
            alignRight ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
          } ${menuWidth ?? 'w-56'} overflow-hidden rounded-card border border-border bg-app py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.08)]`}
        >
          {items.map((it) => (
            <button
              key={it.value}
              type="button"
              role="option"
              aria-selected={it.value === value}
              onClick={() => {
                setOpen(false);
                onSelect(it.value);
              }}
              className="flex w-full cursor-pointer items-start justify-between gap-3 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-sidebar"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-medium leading-[1.4] text-ink">{it.label}</span>
                {it.description && (
                  <span className="block text-[11px] leading-[1.4] text-ink-2">{it.description}</span>
                )}
              </span>
              {it.value === value && <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- ModalShell（浮层质感：白卡 12px 圆角 + 浮层阴影 + 半透明遮罩） ----------

export function ModalShell({
  onDismiss,
  width,
  children,
}: {
  onDismiss: () => void;
  width?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20"
      onMouseDown={onDismiss}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
        className={`${width ?? 'w-[400px]'} rounded-card border border-border bg-app p-4 shadow-[0_8px_32px_rgba(0,0,0,0.10)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
