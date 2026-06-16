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
        <h2 className="text-[24px] font-semibold leading-[32px] tracking-[-0.015em] text-ink">
          {t('settings.title')}
        </h2>
      }
    >
      <div className="max-w-[640px]">

        {/* Projects：列表多时卡内滚动，不顶走下方 Refresh/Advanced */}
        <Card title={t('settings.projects')}>
          {projects.length === 0 ? (
            <div className="col-span-full px-4 py-3 text-[13px] text-ink-3">{t('settings.noProjects')}</div>
          ) : (
            <div className="col-span-full max-h-[280px] divide-y divide-divider overflow-y-auto">
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
                className="h-9 w-24 cursor-text rounded-control border border-border bg-app px-3 text-right text-[14px] text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/10"
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
    <section className="mb-8">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-3">{title}</p>
      {/* grid-content: 12 cols, 16px gap — SettingRow bands share this subgrid */}
      <div className="grid-content divide-y divide-divider overflow-hidden rounded-card border border-border bg-app">{children}</div>
    </section>
  );
}

function SettingRow({ title, desc, control }: { title: string; desc: string; control: ReactNode }) {
  return (
    /* grid-band: spans all 12 cols, re-exposes subgrid for children */
    <div className="grid-band px-4 py-4">
      {/* label: cols 1–8 */}
      <div className="min-w-0" style={{ gridColumn: '1 / 9' }}>
        <p className="text-[14px] font-medium leading-[24px] text-ink">{title}</p>
        <p className="text-[13px] leading-[20px] text-ink-2">{desc}</p>
      </div>
      {/* control: cols 9–12, right-aligned */}
      <div className="flex items-center justify-end" style={{ gridColumn: '9 / 13' }}>
        {control}
      </div>
    </div>
  );
}
