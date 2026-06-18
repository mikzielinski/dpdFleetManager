import { LanguageSettingsCard } from './LanguageSettingsCard';
import { useI18n } from '../i18n/I18nProvider';

export function SettingsSection() {
  const { t } = useI18n();

  return (
    <section className="panel settings-page-panel">
      <div className="panel-head">
        <div>
          <h2>{t('settings.title')}</h2>
          <p className="panel-sub">{t('settings.pageSubtitle')}</p>
        </div>
      </div>
      <LanguageSettingsCard />
    </section>
  );
}
