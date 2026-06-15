// 设置视图：Projects / Refresh / Advanced / Language / Updates
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SkimConfig } from '../domain/types';
import { useSkim } from '../store';
import { Badge, Button, Dropdown, shortenPath, Toggle, ViewScroll } from './ui';

const ORIGIN_KEY: Record<string, string> = {
  manual: 'settings.originManual',
  'auto-claude': 'settings.originClaude',
  'auto-codex': 'settings.originCodex',
};

const LOCALES: SkimConfig['locale'][] = ['auto', 'en', 'zh-CN'];

export default function SettingsView() {
  const { t } = useTranslation();
  const config = useSkim((s) => s.config);
  const projects = useSkim((s) => s.projects);
  const home = useSkim((s) => s.home);
  const removeProject = useSkim((s) => s.removeProject);
  const updateConfig = useSkim((s) => s.updateConfig);
  const update = useSkim((s) => s.update);
  const checkUpdate = useSkim((s) => s.checkUpdate);
  const [checking, setChecking] = useState(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    await checkUpdate();
    setChecking(false);
  };

  // interval 输入：本地缓冲，blur / Enter 时夹取 10–600 再落盘
  const [intervalStr, setIntervalStr] = useState(String(config.refresh.intervalSec));
  useEffect(() => {
    setIntervalStr(String(config.refresh.intervalSec));
  }, [config.refresh.intervalSec]);

  const commitInterval = () => {
    const n = Math.round(Number(intervalStr));
    if (!Number.isFinite(n)) {
      setIntervalStr(String(config.refresh.intervalSec));
      return;
    }
    const v = Math.min(600, Math.max(10, n));
    setIntervalStr(String(v));
    if (v !== config.refresh.intervalSec) {
      void updateConfig({ refresh: { ...config.refresh, intervalSec: v } });
    }
  };

  return (
    <ViewScroll
      header={
        <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
          {t('settings.title')}
        </h2>
      }
    >
      <div className="max-w-[640px]">

        {/* Projects：列表多时卡内滚动，不顶走下方 Refresh/Advanced */}
        <Card title={t('settings.projects')}>
          {projects.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-ink-3">{t('settings.noProjects')}</div>
          ) : (
            <div className="max-h-[280px] divide-y divide-divider overflow-y-auto">
              {projects.map((p) => (
                <div key={p.path} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <span className="truncate font-mono text-[12px] leading-[1.5] text-ink">
                        {shortenPath(p.path, home)}
                      </span>
                      <Badge variant="outline">{t(ORIGIN_KEY[p.origin])}</Badge>
                    </p>
                    <p className="text-[12px] text-ink-3">{t('settings.skillCount', { count: p.skillCount })}</p>
                  </div>
                  <Button compact onClick={() => void removeProject(p.path)}>
                    {t('settings.remove')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Refresh */}
        <Card title={t('settings.refresh')}>
          <SettingRow
            title={t('settings.autoRefresh')}
            desc={t('settings.autoRefreshDesc')}
            control={
              <Toggle
                checked={config.refresh.auto}
                onChange={(v) => void updateConfig({ refresh: { ...config.refresh, auto: v } })}
                label={t('settings.autoRefresh')}
              />
            }
          />
          <SettingRow
            title={t('settings.interval')}
            desc={t('settings.intervalDesc')}
            control={
              <input
                type="number"
                min={10}
                max={600}
                step={1}
                value={intervalStr}
                onChange={(e) => setIntervalStr(e.target.value)}
                onBlur={commitInterval}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitInterval();
                }}
                aria-label={t('settings.interval')}
                className="h-8 w-20 cursor-text rounded-control border border-border bg-app px-2.5 text-right text-[13px] text-ink focus:border-accent"
              />
            }
          />
        </Card>

        {/* Advanced */}
        <Card title={t('settings.advanced')}>
          <SettingRow
            title={t('settings.advancedMode')}
            desc={t('settings.advancedModeDesc')}
            control={
              <Toggle
                checked={config.advancedMode}
                onChange={(v) => void updateConfig({ advancedMode: v })}
                label={t('settings.advancedMode')}
              />
            }
          />
        </Card>

        {/* Language */}
        <Card title={t('settings.language')}>
          <SettingRow
            title={t('settings.language')}
            desc={t('settings.languageDesc')}
            control={
              <Dropdown
                value={config.locale}
                items={LOCALES.map((v) => ({ value: v, label: t(`lang.${v}`) }))}
                onSelect={(v) => void updateConfig({ locale: v })}
                ariaLabel={t('settings.language')}
                alignRight
                menuWidth="w-44"
              />
            }
          />
        </Card>

        {/* Updates */}
        <Card title={t('settings.updates')}>
          <SettingRow
            title={t('settings.checkUpdates')}
            desc={update ? t('settings.updateAvailable', { version: update.version }) : t('settings.checkUpdatesDesc')}
            control={
              <Button compact onClick={() => void handleCheckUpdate()} disabled={checking}>
                {checking ? t('settings.checking') : t('settings.checkNow')}
              </Button>
            }
          />
        </Card>
      </div>
    </ViewScroll>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <p className="mb-1.5 text-[13px] font-medium text-ink-3">{title}</p>
      <div className="divide-y divide-divider overflow-hidden rounded-card border border-border bg-app">{children}</div>
    </section>
  );
}

function SettingRow({ title, desc, control }: { title: string; desc: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium leading-[1.4] text-ink">{title}</p>
        <p className="text-[13px] leading-[1.55] text-ink-2">{desc}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
