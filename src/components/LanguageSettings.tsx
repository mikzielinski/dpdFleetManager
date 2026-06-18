import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { serializeLocaleFile } from '../i18n/localeStore';

type Props = {
  presentation?: 'modal' | 'inline';
  autoOpenEditor?: string | null;
  onEditorOpened?: () => void;
};

export function LanguageSettings({
  presentation = 'modal',
  autoOpenEditor = null,
  onEditorOpened,
}: Props) {
  const {
    locale,
    locales,
    setLocale,
    importLocaleFile,
    removeCustomLocale,
    getLocaleFile,
    downloadLocale,
    saveLocaleFromJson,
    t,
  } = useI18n();
  const [open, setOpen] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editorText, setEditorText] = useState('');
  const [editorMsg, setEditorMsg] = useState<string | null>(null);
  const [editorError, setEditorError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogTitleId = useId();
  const editorId = useId();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImportMsg(null);
    setImportError(false);
    try {
      await importLocaleFile(file);
      setImportMsg(t('settings.importSuccess', { name: file.name }));
    } catch (e) {
      setImportError(true);
      setImportMsg(e instanceof Error ? e.message : t('settings.importError'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openEditor = (code: string) => {
    const file = getLocaleFile(code);
    if (!file) return;
    setEditCode(code);
    setEditorText(serializeLocaleFile(file));
    setEditorMsg(null);
    setEditorError(false);
  };

  const closeEditor = () => {
    setEditCode(null);
    setEditorText('');
    setEditorMsg(null);
    setEditorError(false);
  };

  const handleSaveEditor = () => {
    if (!editCode) return;
    setEditorMsg(null);
    setEditorError(false);
    try {
      const saved = saveLocaleFromJson(editorText, editCode);
      setEditorText(serializeLocaleFile(saved));
      setEditCode(saved.meta.code);
      setEditorMsg(t('settings.saveSuccess', { code: saved.meta.code }));
    } catch (e) {
      setEditorError(true);
      setEditorMsg(e instanceof Error ? e.message : t('settings.saveError'));
    }
  };

  useEffect(() => {
    if (!autoOpenEditor) return;
    const file = getLocaleFile(autoOpenEditor);
    if (!file) return;
    setOpen(true);
    setEditCode(autoOpenEditor);
    setEditorText(serializeLocaleFile(file));
    setEditorMsg(null);
    setEditorError(false);
    onEditorOpened?.();
  }, [autoOpenEditor, getLocaleFile, onEditorOpened]);

  const body = (
    <>
      <section className="settings-section">
        <h3>{t('settings.language')}</h3>
        <p className="settings-hint">{t('settings.languageHint')}</p>
        <ul className="language-list" role="listbox" aria-label={t('settings.language')}>
          {locales.map((item) => (
            <li key={item.code} className="language-list-item">
              <button
                type="button"
                role="option"
                aria-selected={locale === item.code}
                className={`language-option${locale === item.code ? ' language-option--active' : ''}`}
                onClick={() => setLocale(item.code)}
              >
                <span className="language-option-name">{item.nativeName}</span>
                <span className="language-option-meta">
                  {item.code}
                  {' · '}
                  {item.isCustom ? t('settings.custom') : t('settings.builtin')}
                </span>
              </button>
              <div className="language-item-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  title={t('settings.download')}
                  onClick={() => downloadLocale(item.code)}
                >
                  {t('settings.download')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  title={t('settings.edit')}
                  onClick={() => openEditor(item.code)}
                >
                  {t('settings.edit')}
                </button>
                {item.isCustom && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs language-remove"
                    onClick={() => {
                      removeCustomLocale(item.code);
                      if (editCode === item.code) closeEditor();
                    }}
                  >
                    {t('settings.removeCustom')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {!editCode && (
        <section className="settings-section settings-quick-actions">
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
            onClick={() => openEditor(locale)}
          >
            {t('settings.editCurrent')}
          </button>
        </section>
      )}

      <section className="settings-section">
        <h3>{t('settings.upload')}</h3>
        <p className="settings-hint">{t('settings.uploadHint')}</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="language-file-input"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {importMsg && (
          <p className={importError ? 'settings-msg settings-msg--error' : 'settings-msg'}>
            {importMsg}
          </p>
        )}
      </section>

      {editCode && (
        <section className="settings-section settings-editor-section">
          <div className="settings-editor-head">
            <h3>{t('settings.editorTitle', { code: editCode })}</h3>
            <div className="settings-editor-toolbar">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => downloadLocale(editCode)}
              >
                {t('settings.download')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeEditor}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
          <p className="settings-hint">{t('settings.editorHint')}</p>
          <textarea
            id={editorId}
            className="language-editor"
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            spellCheck={false}
            aria-label={t('settings.editorTitle', { code: editCode })}
          />
          <div className="settings-editor-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveEditor}>
              {t('settings.saveAndApply')}
            </button>
          </div>
          {editorMsg && (
            <p className={editorError ? 'settings-msg settings-msg--error' : 'settings-msg'}>
              {editorMsg}
            </p>
          )}
        </section>
      )}
    </>
  );

  if (presentation === 'inline') {
    return <div className="settings-inline">{body}</div>;
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm settings-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('settings.title')}
      >
        ⚙ {t('settings.title')}
      </button>

      {open && (
        <div className="settings-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="settings-dialog settings-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="settings-dialog-head">
              <h2 id={dialogTitleId}>{t('settings.title')}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </header>
            {body}
          </div>
        </div>
      )}
    </>
  );
}
