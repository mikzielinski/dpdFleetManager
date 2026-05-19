import { useEffect, useState } from 'react';

interface Props {
  blob: Blob | null;
  mime: string;
  loading: boolean;
  error: string | null;
}

async function sniffMime(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  return blob.type || 'application/octet-stream';
}

export function InvoicePreview({ blob, mime, loading, error }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [effectiveMime, setEffectiveMime] = useState(mime);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      const detected = await sniffMime(blob);
      if (cancelled) return;
      setEffectiveMime(detected);
      objectUrl = URL.createObjectURL(new Blob([blob], { type: detected }));
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  if (loading) {
    return (
      <div className="preview-box preview-loading">
        <div className="loading-spinner" />
        <p>Ładowanie faktury…</p>
      </div>
    );
  }

  if (error) {
    return <div className="preview-box preview-error">{error}</div>;
  }

  if (!blob || !url) {
    return (
      <div className="preview-box preview-empty">
        Brak pliku faktury dla tego rekordu (pole typu File w Data Fabric).
      </div>
    );
  }

  const isPdf = effectiveMime.includes('pdf');
  const isImage = effectiveMime.startsWith('image/');

  return (
    <div className="preview-box">
      {isPdf && <iframe title="Podgląd faktury PDF" src={url} className="preview-iframe" />}
      {isImage && <img src={url} alt="Faktura" className="preview-image" />}
      {!isPdf && !isImage && (
        <div className="preview-fallback">
          <p>Podgląd niedostępny ({effectiveMime})</p>
          <a href={url} download="faktura">
            Pobierz plik
          </a>
        </div>
      )}
    </div>
  );
}


