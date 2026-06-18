import { useState } from 'react';
import { LanguageSettings } from './LanguageSettings';
import { useI18n } from '../i18n/I18nProvider';

export function LanguageSettingsCard() {
  const { t, locale, downloadLocale } = useI18n();
  const [editorCode, setEditorCode] = useState<string | null>(null);

  return (
    <div className="language-info-card">
      <div className="language-info-card-head">
        <h3>{t('settings.title')}</h3>
        <span className="language-info-card-locale">{locale.toUpperCase()}</span>
      </div>
      <p className="language-info-hint">{t('settings.languageHint')}</p>
      <p className="language-info-hint">{t('settings.uploadHint')}</p>
      <div className="language-card-actions">
        <LanguageSettings autoOpenEditor={editorCode} onEditorOpened={() => setEditorCode(null)} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => downloadLocale(locale)}
        >
          {t('settings.downloadCurrent')}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setEditorCode(locale)}
        >
          {t('settings.editCurrent')}
        </button>
      </div>
    </div>
  );
}
