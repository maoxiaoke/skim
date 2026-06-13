// 侧边栏（230px）：Library / Agents / Projects / Settings — design.md §4.1
import { open } from '@tauri-apps/plugin-dialog';
import ClaudeCodeMono from '@lobehub/icons/es/ClaudeCode/components/Mono';
import CodexMono from '@lobehub/icons/es/Codex/components/Mono';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isStoreRecord, useSkim } from '../store';
import {
  basename,
  IconArchive,
  IconBox,
  IconFolder,
  IconGear,
  IconPanelLeft,
  IconPlus,
} from './ui';

function SideItem({
  active,
  onClick,
  icon,
  label,
  count,
  muted,
}: {
  active?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-control px-2 text-left transition-colors duration-150 ${
        active ? 'bg-selected' : 'hover:bg-hover active:bg-selected'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-ink' : 'text-ink-2'}`}>{icon}</span>
      <span className={`min-w-0 flex-1 truncate text-[13px] ${muted ? 'text-ink-2' : 'text-ink'} ${active ? 'font-medium' : ''}`}>
        {label}
      </span>
      {count !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-ink-3">{count}</span>}
    </button>
  );
}

export default function Sidebar() {
  const { t } = useTranslation();
  const view = useSkim((s) => s.view);
  const agentFilter = useSkim((s) => s.agentFilter);
  const records = useSkim((s) => s.records);
  const archive = useSkim((s) => s.archive);
  const projects = useSkim((s) => s.projects);
  const setView = useSkim((s) => s.setView);
  const setAgentFilter = useSkim((s) => s.setAgentFilter);
  const addProject = useSkim((s) => s.addProject);
  const collapsed = useSkim((s) => s.sidebarCollapsed);
  const toggleSidebar = useSkim((s) => s.toggleSidebar);

  // Agents 区只计用户级；Codex 含 bundled 与 Store（它确实加载两者）；项目级归 Projects 区
  const claudeCount = records.filter((r) => r.agent === 'claude' && r.scope.kind !== 'project').length;
  const codexCount = records.filter((r) => r.agent === 'codex' && r.scope.kind !== 'project').length;
  const storeCount = records.filter(isStoreRecord).length;
  // 0 技能的自动发现项目不展示（手动添加的始终保留）
  const visibleProjects = projects.filter((p) => p.skillCount > 0 || p.origin === 'manual');

  const goSkills = (filter: typeof agentFilter) => {
    setView('skills');
    setAgentFilter(filter);
  };

  const onAddProject = async () => {
    const picked = await open({ directory: true, multiple: false, title: t('nav.addProject') });
    if (typeof picked === 'string' && picked) await addProject(picked);
  };

  return (
    <aside
      className={`relative h-full shrink-0 overflow-hidden border-divider bg-sidebar transition-[width] duration-300 ease-strong ${
        collapsed ? 'w-0 border-r-0' : 'w-[210px] border-r'
      }`}
    >
      <div className="flex h-full w-[210px] flex-col">
      {/* overlay 标题栏：红绿灯悬浮在此区域内，整块可拖拽窗口 */}
      <div data-tauri-drag-region className="h-[44px] shrink-0" />
      <button
        type="button"
        aria-label={t('nav.toggleSidebar')}
        title={t('nav.toggleSidebar')}
        onClick={toggleSidebar}
        className="pressable absolute right-2 top-[10px] flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-selected hover:text-ink-2"
      >
        <IconPanelLeft className="h-4 w-4" />
      </button>
      <div data-tauri-drag-region className="px-3 pb-1.5">
        <h1 className="pointer-events-none text-[13px] font-semibold leading-[1.3] text-ink">{t('app.name')}</h1>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pt-1.5">
        {/* 浏览维度：Store 与 Agents 同层，无 Library 套娃标题 */}
        <div>
          <SideItem
            active={view === 'skills' && agentFilter === 'store'}
            onClick={() => goSkills('store')}
            icon={<IconBox className="h-4 w-4" />}
            label={t('nav.store')}
            count={storeCount}
          />
        </div>

        <div>
          <p className="px-2 pb-1 text-[11px] font-medium text-ink-3">{t('nav.agents')}</p>
          <SideItem
            active={view === 'skills' && agentFilter === 'claude'}
            onClick={() => goSkills('claude')}
            icon={<ClaudeCodeMono size={16} />}
            label={t('agent.claude')}
            count={claudeCount}
          />
          <SideItem
            active={view === 'skills' && agentFilter === 'codex'}
            onClick={() => goSkills('codex')}
            icon={<CodexMono size={16} />}
            label={t('agent.codex')}
            count={codexCount}
          />
        </div>

        <div>
          <p className="px-2 pb-1 text-[11px] font-medium text-ink-3">{t('nav.projects')}</p>
          {visibleProjects.map((p) => (
            <SideItem
              key={p.path}
              active={view === 'skills' && agentFilter === `project:${p.path}`}
              onClick={() => goSkills(`project:${p.path}`)}
              icon={<IconFolder className="h-4 w-4" />}
              label={basename(p.path)}
              count={p.skillCount}
            />
          ))}
          <SideItem
            onClick={() => void onAddProject()}
            icon={<IconPlus className="h-4 w-4 text-ink-3" />}
            label={t('nav.addProject')}
            muted
          />
        </div>
      </nav>

      {/* 管理线：低频入口下沉，与 Settings 同区 */}
      <div className="px-2.5 pb-2.5 pt-1.5">
        <SideItem
          active={view === 'archive'}
          onClick={() => setView('archive')}
          icon={<IconArchive className="h-4 w-4" />}
          label={t('nav.archive')}
          count={archive.length}
        />
        <SideItem
          active={view === 'settings'}
          onClick={() => setView('settings')}
          icon={<IconGear className="h-4 w-4" />}
          label={t('nav.settings')}
        />
      </div>
      </div>
    </aside>
  );
}
