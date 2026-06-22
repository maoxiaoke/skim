import { openUrl } from '@tauri-apps/plugin-opener';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useSkim } from '../store';
import { IconButton, IconX } from './ui';

export default function UpdateBanner() {
  const { t } = useTranslation();
  const update = useSkim((s) => s.update);
  const updateDismissed = useSkim((s) => s.updateDismissed);
  const updateInstalling = useSkim((s) => s.updateInstalling);
  const updateError = useSkim((s) => s.updateError);
  const dismissUpdate = useSkim((s) => s.dismissUpdate);
  const installUpdate = useSkim((s) => s.installUpdate);

  const visible = !!update && !updateDismissed;

  return (
    <AnimatePresence>
      {visible && update && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div
            role="status"
            className="border-b border-accent/20 bg-accent/8 px-6 py-2 text-[13px] leading-[1.55]"
          >
            <div className="flex items-center gap-3">
              <span className="flex-1 text-ink">
                <span className="font-medium">{t('update.available', { version: update.version })}</span>
                <button
                  onClick={() => void openUrl(update.notesUrl)}
                  className="ml-2 text-accent underline-offset-2 hover:underline"
                >
                  {t('update.showNotes')}
                </button>
              </span>
              <button
                onClick={() => void installUpdate()}
                disabled={updateInstalling}
                className="shrink-0 rounded-full bg-accent px-3.5 py-1 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {updateInstalling ? t('update.installing') : t('update.install')}
              </button>
              <IconButton label={t('update.dismiss')} onClick={dismissUpdate}>
                <IconX className="h-4 w-4 text-ink-2" />
              </IconButton>
            </div>
            {updateError && (
              <p className="mt-1.5 whitespace-pre-wrap text-[12px] text-red-600">
                {t('update.failed')}: {updateError}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
