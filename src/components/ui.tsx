// 共享小件：图标 / 徽章 / 开关 / 按钮 / 下拉 / 模态壳 — design.md §4–§6
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { useSkim } from '../store';

// ---------- 路径小工具 ----------

export function basename(p: string): string {
  const t = p.replace(/\/+$/, '');
  const i = t.lastIndexOf('/');
  return i >= 0 ? t.slice(i + 1) : t;
}

export function shortenPath(p: string, home: string): string {
  return home && p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

// ---------- 图标（@mynaui/icons-react） ----------

import {
  Search        as IconSearch,
  Refresh       as IconRefresh,
  Folder        as IconFolder,
  File          as IconFile,
  Trash         as IconTrash,
  Archive       as IconArchive,
  Lock          as IconLock,
  X             as IconX,
  ChevronDown   as IconChevronDown,
  ChevronsUpDown as IconChevronsUpDown,
  Plus          as IconPlus,
  ExternalLink  as IconExternal,
  Check         as IconCheck,
  DangerTriangle as IconAlert,
  LayersTwo     as IconLayers,
  Terminal      as IconTerminal,
  Code          as IconCode,
  Link          as IconLink,
  PanelLeft     as IconPanelLeft,
  Box           as IconBox,
  CogOne        as IconGear,
} from '@mynaui/icons-react';

export {
  IconSearch, IconRefresh, IconFolder, IconFile, IconTrash, IconArchive,
  IconLock, IconX, IconChevronDown, IconChevronsUpDown, IconPlus, IconExternal,
  IconCheck, IconAlert, IconLayers, IconTerminal, IconCode, IconLink,
  IconPanelLeft, IconBox, IconGear,
};

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
  const { t } = useTranslation();
  const collapsed = useSkim((s) => s.sidebarCollapsed);
  const toggleSidebar = useSkim((s) => s.toggleSidebar);
  const [scrolled, setScrolled] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div
        data-tauri-drag-region="deep"
        className={`shrink-0 border-b px-6 pb-3 pt-5 transition-colors duration-150 ${
          scrolled ? 'border-divider' : 'border-transparent'
        }`}
      >
        <div className="mx-auto w-full max-w-[720px]">
          {collapsed ? (
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={t('nav.toggleSidebar')}
                title={t('nav.toggleSidebar')}
                className="pressable mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink-2"
              >
                <IconPanelLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">{header}</div>
            </div>
          ) : (
            header
          )}
        </div>
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // 菜单用 fixed 定位 + Portal 渲染到 body，脱离祖先 overflow-hidden 的裁切；
  // flip = 视口下方空间不足时向上展开（菜单底边贴按钮顶边）
  const [pos, setPos] = useState<{ top: number; bottom: number; left?: number; right?: number; flip: boolean } | null>(
    null,
  );

  // 依据按钮视口矩形计算菜单锚点；开启期间随滚动/缩放重算
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btnRef.current;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const flip = spaceBelow < 200 && r.top > spaceBelow;
      setPos({
        top: r.bottom + 4,
        bottom: window.innerHeight - r.top + 4,
        left: alignRight ? undefined : r.left,
        right: alignRight ? window.innerWidth - r.right : undefined,
        flip,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, alignRight]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // 菜单已 Portal 到 body，外点判定需同时排除按钮包裹与菜单本身
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
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
    <div ref={wrapRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
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
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: pos.flip ? undefined : pos.top,
              bottom: pos.flip ? pos.bottom : undefined,
              left: pos.left,
              right: pos.right,
            }}
            className={`pop-in z-50 ${alignRight ? 'origin-top-right' : 'origin-top-left'} ${
              menuWidth ?? 'w-56'
            } overflow-hidden rounded-card border border-border bg-app py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.08)]`}
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
          </div>,
          document.body,
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
