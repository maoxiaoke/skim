// 全局确认对话框：store.confirm 驱动；Esc 取消 / Enter 确认 — design.md §4.10
import { useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { fmtSize, useSkim } from '../store';
import { Button, ModalShell, shortenPath } from './ui';

export default function ConfirmDialog() {
  const { t } = useTranslation();
  const confirm = useSkim((s) => s.confirm);
  const home = useSkim((s) => s.home);
  const confirmAccept = useSkim((s) => s.confirmAccept);
  const confirmCancel = useSkim((s) => s.confirmCancel);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void confirmAccept();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, confirmAccept, confirmCancel]);

  const title = confirm
    ? confirm.items.length === 1
      ? t(`confirm.${confirm.kind}TitleOne`, { name: confirm.items[0].name })
      : t(`confirm.${confirm.kind}Title`, { count: confirm.items.length })
    : '';

  return (
    <AnimatePresence>
      {confirm && (
        <ModalShell key="confirm" onDismiss={confirmCancel}>
      <h3 className="mb-2 text-[15px] font-semibold leading-[1.3] text-ink">{title}</h3>
      <p className="mb-3 text-[13px] leading-[1.55] text-ink-2">{t(`confirm.${confirm.kind}Body`)}</p>
      {confirm.warnings && (
        <div className="mb-3 rounded-control bg-warning-soft px-3 py-2.5 text-[13px] leading-[1.55] text-warning">
          {confirm.warnings.codexLoadedCount > 0 && (
            <p className="font-medium">
              {t('warn.codexLoaded', { count: confirm.warnings.codexLoadedCount })}
            </p>
          )}
          {confirm.warnings.brokenLinks.length > 0 && (
            <>
              <p className="font-medium">
                {t('warn.brokenLinks', { count: confirm.warnings.brokenLinks.length })}
              </p>
              <ul className="mt-1 max-h-[18vh] overflow-y-auto">
                {confirm.warnings.brokenLinks.map((p) => (
                  <li key={p} className="truncate font-mono text-[12px]">
                    {shortenPath(p, home)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {/* 逐项清单：限高滚动，多选几百项也撑不爆弹窗 */}
      <ul className="mb-5 max-h-[40vh] divide-y divide-divider overflow-y-auto rounded-control border border-border">
        {confirm.items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="min-w-0 truncate text-[13px] text-ink">{it.name}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{fmtSize(it.sizeBytes)}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button onClick={confirmCancel}>{t('confirm.cancel')}</Button>
        <Button
          variant={confirm.danger ? 'dangerSolid' : 'primary'}
          onClick={() => void confirmAccept()}
        >
          {t('confirm.confirm')}
        </Button>
      </div>
        </ModalShell>
      )}
    </AnimatePresence>
  );
}
