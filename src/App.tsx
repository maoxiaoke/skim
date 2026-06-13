// 应用骨架：三栏布局 + 启动/定时刷新 + 警示条 + 全局对话框与失败 toast
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import ArchiveView from './components/ArchiveView';
import ConfirmDialog from './components/ConfirmDialog';
import DetailDrawer from './components/DetailDrawer';
import SettingsView from './components/SettingsView';
import Sidebar from './components/Sidebar';
import SkillsView from './components/SkillsView';
import { IconButton, IconPanelLeft, IconX, shortenPath, Spinner } from './components/ui';
import { useSkim } from './store';

export default function App() {
  const { t, i18n } = useTranslation();
  const view = useSkim((s) => s.view);
  const selectedId = useSkim((s) => s.selectedId);
  const records = useSkim((s) => s.records);
  const error = useSkim((s) => s.error);
  const corruptConfigs = useSkim((s) => s.corruptConfigs);
  const home = useSkim((s) => s.home);
  const locale = useSkim((s) => s.config.locale);
  const intervalSec = useSkim((s) => s.config.refresh.intervalSec);
  const sidebarCollapsed = useSkim((s) => s.sidebarCollapsed);
  const toggleSidebar = useSkim((s) => s.toggleSidebar);

  // 启动刷新
  useEffect(() => {
    void useSkim.getState().refresh();
  }, []);

  // 定时刷新：config.refresh.auto 为真且窗口聚焦时才执行
  useEffect(() => {
    const ms = Math.max(10, intervalSec) * 1000;
    const id = window.setInterval(() => {
      const s = useSkim.getState();
      if (s.config.refresh.auto && document.hasFocus() && !s.loading) void s.refresh();
    }, ms);
    return () => window.clearInterval(id);
  }, [intervalSec]);

  // locale 同步（SettingsView 只写 config，这里统一 changeLanguage）
  useEffect(() => {
    const target =
      locale === 'auto' ? (navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en') : locale;
    if (i18n.language !== target) void i18n.changeLanguage(target);
  }, [locale, i18n]);

  const selected =
    view === 'skills' && selectedId ? (records.find((r) => r.id === selectedId) ?? null) : null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex h-full bg-app text-ink">
      <Sidebar />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* overlay 标题栏：主区顶部 28px 空白带可拖拽窗口 */}
        <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-20 h-7" />
        {sidebarCollapsed && (
          <button
            type="button"
            aria-label={t('nav.toggleSidebar')}
            title={t('nav.toggleSidebar')}
            onClick={toggleSidebar}
            className="pressable absolute left-[84px] top-[10px] z-30 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink-2"
          >
            <IconPanelLeft className="h-4 w-4" />
          </button>
        )}
        {corruptConfigs.length > 0 && (
          <div role="alert" className="border-b border-divider bg-warning-soft px-6 py-2 text-[13px] leading-[1.55] text-warning">
            {t('banner.corrupt', {
              files: corruptConfigs.map((p) => shortenPath(p, home)).join(', '),
            })}
          </div>
        )}
        {error && (
          <div role="alert" className="border-b border-divider bg-warning px-6 py-2 text-[13px] leading-[1.55] text-white">
            {t('banner.error', { message: error })}
          </div>
        )}

        {/* 内容在主区居中（有最大宽度）；抽屉展开时主区变窄，内容自动在更窄区域居中（左移让位） */}
        <div className="min-h-0 flex-1">
          {view === 'skills' && <SkillsView />}
          {view === 'archive' && <ArchiveView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {selected && <DetailDrawer key={selected.id} rec={selected} />}
      </AnimatePresence>

      <ConfirmDialog />
      <FailureToast />
      <BusyOverlay />
    </div>
    </MotionConfig>
  );
}

// ---------- 批量执行遮罩：执行完成前禁止一切页面操作 ----------

function BusyOverlay() {
  const { t } = useTranslation();
  const busy = useSkim((s) => s.busy);
  return (
    <AnimatePresence>
      {busy && (
        <motion.div
          role="alert"
          aria-busy="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/20"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            className="flex items-center gap-3 rounded-card border border-border bg-app px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
          >
            <Spinner className="h-5 w-5 text-accent" />
            <p className="text-[13px] tabular-nums text-ink">
              {t(`busy.${busy.kind}`, { done: busy.done, total: busy.total })}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- lastResults 失败 toast ----------

function FailureToast() {
  const { t } = useTranslation();
  const lastResults = useSkim((s) => s.lastResults);
  const [dismissed, setDismissed] = useState<typeof lastResults>(null);

  // 恢复冲突（CONFLICT）由 ArchiveView 的弹层处理，不进 toast
  const failures = useMemo(
    () =>
      (lastResults ?? []).filter(
        (r) => !r.ok && !r.steps.some((s) => s.error?.toUpperCase().includes('CONFLICT')),
      ),
    [lastResults],
  );

  useEffect(() => {
    if (failures.length === 0) return;
    const id = window.setTimeout(() => setDismissed(lastResults), 8000);
    return () => window.clearTimeout(id);
  }, [failures.length, lastResults]);

  const show = failures.length > 0 && dismissed !== lastResults;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center">
      <AnimatePresence>
        {show && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            className="pointer-events-auto flex max-w-[560px] items-start gap-3 rounded-card border border-border bg-app py-2.5 pl-4 pr-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
          >
            <div className="min-w-0 text-[13px] leading-[1.55]">
              <p className="font-medium text-warning">{t('toast.failed', { count: failures.length })}</p>
              {failures.slice(0, 3).map((f, i) => (
                <p key={i} className="truncate text-ink-2">
                  {f.plan.summary.skillName}: {f.steps.find((s) => !s.ok)?.error ?? ''}
                </p>
              ))}
            </div>
            <IconButton label={t('toast.dismiss')} onClick={() => setDismissed(lastResults)}>
              <IconX className="h-4 w-4" />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
