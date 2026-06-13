// 状态控件：默认 iOS 开关；Claude 高级模式 = 四档下拉；Codex 高级模式附加 Auto-trigger 小开关
import { useTranslation } from 'react-i18next';
import type { SkillRecord, SkillStatus } from '../domain/types';
import { isStoreRecord, useSkim } from '../store';
import { Dropdown, IconArchive, IconButton, IconTrash, Toggle } from './ui';
import type { DropdownItem } from './ui';

const CLAUDE_STATUSES: SkillStatus[] = ['on', 'name-only', 'user-invocable-only', 'off'];

export default function StatusControl({ rec }: { rec: SkillRecord }) {
  const { t } = useTranslation();
  const advanced = useSkim((s) => s.config.advancedMode);
  const inStoreView = useSkim((s) => s.agentFilter === 'store');
  const setStatus = useSkim((s) => s.setStatus);
  const setAllowImplicit = useSkim((s) => s.setAllowImplicit);
  const requestArchive = useSkim((s) => s.requestArchive);
  const requestDelete = useSkim((s) => s.requestDelete);

  // stray file 没有状态——只有一个删除按钮
  if (rec.flags.strayFile) {
    return (
      <IconButton label={t('row.deleteStray')} danger onClick={() => requestDelete([rec])}>
        <IconTrash className="h-4 w-4" />
      </IconButton>
    );
  }

  // Store 视图只管生命周期：归档 + 删除（开关在 Codex 视图）
  if (inStoreView && isStoreRecord(rec)) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <IconButton label={t('drawer.archive')} onClick={() => requestArchive([rec])}>
          <IconArchive className="h-4 w-4" />
        </IconButton>
        <IconButton label={t('drawer.delete')} danger onClick={() => requestDelete([rec])}>
          <IconTrash className="h-4 w-4" />
        </IconButton>
      </div>
    );
  }

  // Claude 高级模式：四档下拉（解释文案逐字来自 design.md §4.5）
  if (rec.agent === 'claude' && advanced) {
    const items: DropdownItem<SkillStatus>[] = CLAUDE_STATUSES.map((v) => ({
      value: v,
      label: t(`status.${v}`),
      description: t(`statusDesc.${v}`),
    }));
    return (
      <Dropdown
        value={rec.status}
        items={items}
        onSelect={(v) => {
          if (v !== rec.status) void setStatus(rec, v);
        }}
        ariaLabel={t('control.statusFor', { name: rec.name })}
        compact
        alignRight
        menuWidth="w-[290px]"
      />
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      {rec.agent === 'codex' && advanced && (
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink-3">{t('control.autoTrigger')}</span>
          <Toggle
            small
            checked={rec.allowImplicitInvocation}
            onChange={(v) => void setAllowImplicit(rec, v)}
            label={t('control.autoTriggerFor', { name: rec.name })}
          />
        </span>
      )}
      <Toggle
        checked={rec.status !== 'off'}
        onChange={(v) => void setStatus(rec, v ? 'on' : 'off')}
        label={t('control.statusFor', { name: rec.name })}
      />
    </div>
  );
}
