// 归档视图：列表 + Restore（含 CONFLICT 三选弹层）+ 永久删除确认
import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ArchiveItem } from '../io/refresh';
import { fmtSize, useSkim } from '../store';
import { Badge, Button, IconArchive, ModalShell, shortenPath, Spinner, ViewScroll } from './ui';

export default function ArchiveView() {
  const { t, i18n } = useTranslation();
  const archive = useSkim((s) => s.archive);
  const home = useSkim((s) => s.home);
  const restore = useSkim((s) => s.restore);
  const deleteArchived = useSkim((s) => s.deleteArchived);

  const [conflict, setConflict] = useState<ArchiveItem | null>(null);
  const [toDelete, setToDelete] = useState<ArchiveItem | null>(null);
  const [busyDir, setBusyDir] = useState<string | null>(null);

  const onRestore = async (item: ArchiveItem, mode: 'fail' | 'overwrite' | 'rename') => {
    setBusyDir(item.archiveDir);
    try {
      const result = await restore(item, mode);
      if (!result.ok && result.steps.some((s) => s.error?.toUpperCase().includes('CONFLICT'))) {
        setConflict(item);
      }
    } finally {
      setBusyDir(null);
    }
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <ViewScroll
      header={
        <h2 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
          {t('archive.title')}
        </h2>
      }
    >

      {archive.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <IconArchive className="h-7 w-7 text-ink-3" />
          <p className="text-[15px] font-medium text-ink-2">{t('archive.empty')}</p>
          <p className="max-w-[360px] text-[13px] leading-[1.55] text-ink-3">{t('archive.emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-y divide-divider overflow-hidden rounded-card border border-border bg-app">
          {archive.map((item) => (
            <div key={item.archiveDir} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-medium leading-[1.4] text-ink">
                  <span className="truncate">{item.manifest.skillName}</span>
                  <Badge variant="outline">{t(`agent.${item.manifest.agent}`)}</Badge>
                  {!item.present && <Badge variant="gray">{t('archive.missing')}</Badge>}
                </p>
                <p className="truncate font-mono text-[12px] leading-[1.5] text-ink-2">
                  {shortenPath(item.manifest.sourcePath, home)}
                </p>
                <p className="text-[11px] text-ink-3">
                  {t('archive.archivedAt', { time: fmtDate(item.manifest.archivedAt) })} ·{' '}
                  {fmtSize(item.manifest.sizeBytes)}
                </p>
              </div>
              <Button
                compact
                disabled={!item.present || busyDir === item.archiveDir}
                onClick={() => void onRestore(item, 'fail')}
              >
                {busyDir === item.archiveDir ? <Spinner className="h-3.5 w-3.5" /> : t('archive.restore')}
              </Button>
              <Button compact variant="danger" onClick={() => setToDelete(item)}>
                {t('archive.deleteForever')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 恢复冲突：Overwrite / Keep both / Cancel */}
      <AnimatePresence>
      {conflict && (
        <ModalShell key="conflict" onDismiss={() => setConflict(null)}>
          <h3 className="mb-2 text-[15px] font-semibold leading-[1.3] text-ink">{t('archive.conflictTitle')}</h3>
          <p className="mb-5 break-words text-[13px] leading-[1.55] text-ink-2">
            {t('archive.conflictBody', { path: shortenPath(conflict.manifest.sourcePath, home) })}
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setConflict(null)}>{t('confirm.cancel')}</Button>
            <Button
              onClick={() => {
                const item = conflict;
                setConflict(null);
                void onRestore(item, 'rename');
              }}
            >
              {t('archive.keepBoth')}
            </Button>
            <Button
              variant="dangerSolid"
              onClick={() => {
                const item = conflict;
                setConflict(null);
                void onRestore(item, 'overwrite');
              }}
            >
              {t('archive.overwrite')}
            </Button>
          </div>
        </ModalShell>
      )}
      </AnimatePresence>

      {/* 永久删除确认 */}
      <AnimatePresence>
      {toDelete && (
        <ModalShell key="del" onDismiss={() => setToDelete(null)}>
          <h3 className="mb-2 text-[15px] font-semibold leading-[1.3] text-ink">
            {t('archive.deleteTitle', { name: toDelete.manifest.skillName })}
          </h3>
          <p className="mb-5 text-[13px] leading-[1.55] text-ink-2">{t('archive.deleteBody')}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setToDelete(null)}>{t('confirm.cancel')}</Button>
            <Button
              variant="dangerSolid"
              onClick={() => {
                const item = toDelete;
                setToDelete(null);
                void deleteArchived(item);
              }}
            >
              {t('archive.deleteForever')}
            </Button>
          </div>
        </ModalShell>
      )}
      </AnimatePresence>
    </ViewScroll>
  );
}
