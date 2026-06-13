// 右侧详情抽屉（340px）：徽章 / Details / SKILL.md / Files / 操作区
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type { SkillRecord } from '../domain/types';
import { ipc } from '../io/tauri';
import { fmtSize, isStoreRecord, useSkim } from '../store';
import { Badge, Button, IconButton, IconExternal, IconFile, IconFolder, IconX, shortenPath, Spinner } from './ui';

type MdState = { kind: 'loading' } | { kind: 'ok'; html: string } | { kind: 'error'; message: string };

export default function DetailDrawer({ rec }: { rec: SkillRecord }) {
  const { t } = useTranslation();
  const home = useSkim((s) => s.home);
  const select = useSkim((s) => s.select);
  const requestArchive = useSkim((s) => s.requestArchive);
  const requestDelete = useSkim((s) => s.requestDelete);
  const setAgentFilter = useSkim((s) => s.setAgentFilter);
  const inStoreView = useSkim((s) => s.agentFilter === 'store');
  const isStore = isStoreRecord(rec);

  const [md, setMd] = useState<MdState>({ kind: 'loading' });
  const [files, setFiles] = useState<string[] | null>(null);

  const isStray = rec.flags.strayFile;

  useEffect(() => {
    let alive = true;
    setMd({ kind: 'loading' });
    setFiles(null);

    const mdPath = isStray ? rec.dirPath : `${rec.dirPath}/SKILL.md`;
    void (async () => {
      try {
        const [f] = await ipc.readTextFiles([mdPath]);
        if (!alive) return;
        if (f.content === null) {
          setMd({ kind: 'error', message: f.error ?? t('drawer.noSkillMd') });
          return;
        }
        const raw = await marked.parse(f.content);
        if (alive) setMd({ kind: 'ok', html: DOMPurify.sanitize(raw) });
      } catch (e) {
        if (alive) setMd({ kind: 'error', message: String(e) });
      }
    })();

    if (!isStray) {
      ipc
        .listDirNames(rec.dirPath)
        .then((names) => {
          if (alive) setFiles([...names].sort((a, b) => a.localeCompare(b)));
        })
        .catch(() => {
          if (alive) setFiles([]);
        });
    }

    return () => {
      alive = false;
    };
  }, [rec.id, rec.dirPath, isStray, t]);

  return (
    <motion.aside
      // width 进出场：主区 flex-1 随之平滑补位 → 内容左移让位/右移归位
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 300, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
      className="shrink-0 overflow-hidden border-l border-divider bg-app"
    >
      <div className="flex h-full w-[300px] flex-col">
      {/* 固定头部：标题 + 徽章 + 操作区 */}
      <div className="shrink-0 px-5 pb-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-[15px] font-semibold leading-[1.3] text-ink">{rec.name}</h3>
          <IconButton label={t('drawer.close')} onClick={() => select(null)}>
            <IconX className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Badge variant="outline">{t(`agent.${rec.agent}`)}</Badge>
          <Badge variant="outline">{t(`scope.${rec.scope.kind}`)}</Badge>
          {isStray && <Badge variant="gray">{t('badge.strayFile')}</Badge>}
          {rec.flags.duplicate && <Badge variant="warning">{t('badge.duplicate')}</Badge>}
          {rec.flags.parseError && <Badge variant="warning">{t('badge.metadataIssue')}</Badge>}
        </div>

        {/* 操作区：开关在列表行做（抽屉与列表同时可见），头部只留生命周期操作 */}
        {isStore && !inStoreView ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[12px] leading-[1.55] text-ink-3">{t('hint.manageInStore')}</span>
            <Button compact onClick={() => setAgentFilter('store')}>
              {t('hint.openStore')}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={() => requestArchive([rec])} disabled={rec.flags.locked || isStray} compact>
              {t('drawer.archive')}
            </Button>
            <Button variant="danger" onClick={() => requestDelete([rec])} disabled={rec.flags.locked} compact>
              {t('drawer.delete')}
            </Button>
          </div>
        )}
      </div>

      {/* 滚动正文 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">
        {/* Details 卡 */}
        <p className="mb-1 text-[12px] font-medium text-ink-3">{t('drawer.details')}</p>
        <div className="mb-4 divide-y divide-divider overflow-hidden rounded-card border border-border bg-app">
          <DetailRow label={t('drawer.name')} value={rec.name} />
          <DetailRow label={t('drawer.description')} value={rec.description ?? '—'} />
          <DetailRow label={t('drawer.status')} value={isStray ? '—' : t(`status.${rec.status}`)} />
          <DetailRow
            label={t('drawer.path')}
            value={shortenPath(rec.dirPath, home)}
            mono
            onReveal={() => void revealItemInDir(rec.dirPath)}
            revealTitle={t('drawer.reveal')}
          />
          {rec.isSymlink && (
            <DetailRow
              label={t('drawer.linksTo')}
              value={shortenPath(rec.realPath, home)}
              mono
              onReveal={() => void revealItemInDir(rec.realPath)}
              revealTitle={t('drawer.reveal')}
            />
          )}
        </div>

        {/* SKILL.md 卡 */}
        <p className="mb-1 text-[12px] font-medium text-ink-3">{t('drawer.skillMd')}</p>
        <div className="mb-4 rounded-card border border-border bg-app px-3 py-3">
          {md.kind === 'loading' && (
            <div className="flex justify-center py-4 text-ink-3">
              <Spinner />
            </div>
          )}
          {md.kind === 'error' && <p className="text-[13px] leading-[1.55] text-ink-3">{md.message}</p>}
          {md.kind === 'ok' && (
            // marked.parse → DOMPurify.sanitize，最小 prose 覆盖见 styles.css .skillmd
            <div className="skillmd" dangerouslySetInnerHTML={{ __html: md.html }} />
          )}
        </div>

        {/* Files 卡 */}
        {!isStray && (
          <>
            <p className="mb-1 text-[12px] font-medium text-ink-3">{t('drawer.files')}</p>
            <div className="mb-5 rounded-card border border-border bg-app px-3 py-2.5">
              {files === null ? (
                <div className="flex justify-center py-2 text-ink-3">
                  <Spinner />
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {files.map((name) => (
                    <li key={name} className="flex items-center gap-2">
                      {name.includes('.') ? (
                        <IconFile className="h-3.5 w-3.5 shrink-0 text-ink-2" />
                      ) : (
                        <IconFolder className="h-3.5 w-3.5 shrink-0 text-ink-2" />
                      )}
                      <span className="truncate text-[12px] text-ink">{name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 border-t border-divider pt-2 text-[11px] tabular-nums text-ink-3">
                {t('drawer.total', { size: fmtSize(rec.sizeBytes), count: rec.fileCount })}
              </p>
            </div>
          </>
        )}
      </div>
      </div>
    </motion.aside>
  );
}

function DetailRow({
  label,
  value,
  mono,
  onReveal,
  revealTitle,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onReveal?: () => void;
  revealTitle?: string;
}) {
  const valueCls = `min-w-0 flex-1 break-words text-left ${
    mono ? 'font-mono text-[11px] leading-[1.5]' : 'text-[12px]'
  }`;
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <span className="w-[72px] shrink-0 text-[12px] text-ink-2">{label}</span>
      {onReveal ? (
        <button
          type="button"
          title={revealTitle}
          onClick={onReveal}
          className={`group flex items-start gap-1 text-ink underline-offset-2 hover:underline ${valueCls}`}
        >
          <span className="min-w-0 break-words">{value}</span>
          <IconExternal className="mt-[2px] h-3 w-3 shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        </button>
      ) : (
        <span className={`select-text text-ink ${valueCls}`}>{value}</span>
      )}
    </div>
  );
}
