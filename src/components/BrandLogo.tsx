import { BRAND } from '../brand';

export function BrandLogo() {
  return (
    <div className="brand-logo" aria-label={BRAND.name}>
      <span className="brand-logo-main">Xelto</span>
      <span className="brand-logo-sub">Express</span>
    </div>
  );
}
