import { supportedLanguages } from '../lib/languages';

interface LanguageSelectorProps { value: string; onChange: (value: string) => void; disabled?: boolean; label?: string; }

export function LanguageSelector({ value, onChange, disabled = false, label = 'Preferred language' }: LanguageSelectorProps) {
  return <label className="field"><span className="field__label">{label}</span><select className="field__control" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required>{supportedLanguages.map((language) => <option key={language.code} value={language.code}>{language.flag} - {language.label}</option>)}</select></label>;
}

