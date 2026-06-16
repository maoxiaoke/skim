// 条目行（design.md §4.3）：两行制左侧 + 体积/状态控件/锁 右侧
import { useTranslation } from 'react-i18next';
import type { SkillRecord } from '../domain/types';
import { fmtSize, useSkim } from '../store';
import StatusControl from './StatusControl';
import { Badge, Checkbox, IconAlert, IconLock, shortenPath } from './ui';

export default function SkillRow({ rec }: { rec: SkillRecord }) {
  const { t } = useTranslation();
  const home = useSkim((s) => s.home);
  const batchMode = useSkim((s) => s.batchMode);
  const checked = useSkim((s) => s.checked.has(rec.id));
  const isSelected = useSkim((s) => s.selectedId === rec.id);
  const select = useSkim((s) => s.select);
  const toggleChecked = useSkim((s) => s.toggleChecked);

  const off = rec.status === 'off';
  const midTier = rec.status === 'name-only' || rec.status === 'user-invocable-only';

  return (
    <div
      onClick={() => {
        if (batchMode) toggleChecked(rec.id);
        else select(rec.id);
      }}
      className={`flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-hover active:bg-selected ${
        isSelected && !batchMode ? 'bg-hover' : ''
      }`}
    >
      {batchMode && (
        <Checkbox
          checked={checked}
          onChange={() => toggleChecked(rec.id)}
          label={t('bulk.selectOne', { name: rec.name })}
        />
      )}

      <div className={`min-w-0 flex-1 ${off ? 'opacity-45' : ''}`}>
        <p className="flex items-center gap-1.5 text-[14px] font-medium leading-[1.4] text-ink">
          <span className="truncate">{rec.name}</span>
          {rec.flags.duplicate && (
            <span title={t('badge.duplicateTitle')}>
              <Badge variant="gray">{t('badge.duplicate')}</Badge>
            </span>
          )}
          {rec.flags.conflict && (
            <span title={t('badge.conflictTitle')}>
              <Badge variant="warning">{t('badge.conflict')}</Badge>
            </span>
          )}
          {rec.flags.strayFile && <Badge variant="gray">{t('badge.strayFile')}</Badge>}
          {rec.flags.parseError && (
            <Badge variant="warning">
              <IconAlert className="h-3 w-3" />
              {t('badge.metadataIssue')}
            </Badge>
          )}
          {midTier && <Badge variant="accent">{t(`status.${rec.status}`)}</Badge>}
        </p>
        <p className="truncate text-[13px] leading-[1.5] text-ink-2">
          {rec.flags.strayFile
            ? t('row.strayDesc')
            : rec.isSymlink
              ? <span title={t('row.linkTitle', { path: shortenPath(rec.realPath, home) })}>→ {shortenPath(rec.realPath, home)}</span>
              : (rec.description ?? t('row.noDescription'))}
        </p>
      </div>

      <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{fmtSize(rec.sizeBytes)}</span>

      {!rec.flags.statusLocked && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <StatusControl rec={rec} />
        </div>
      )}

      {rec.flags.locked && (
        <span
          role="img"
          aria-label={t('row.lockTitle')}
          title={t('row.lockTitle')}
          className="flex h-6 w-6 shrink-0 items-center justify-center"
        >
          <IconLock className="h-4 w-4 text-ink-3" />
        </span>
      )}
    </div>
  );
}

