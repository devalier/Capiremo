import { APP_PRESETS, launch, resolveSlot, safeLaunchUrl, type AppSlot } from '../apps';

const POSITION = ['Bottom-left button', 'Bottom-right button'];

export function AppSlotsEditor({ slots, onChange }: { slots: [AppSlot, AppSlot]; onChange: (s: [AppSlot, AppSlot]) => void }) {
  function update(i: 0 | 1, patch: Partial<AppSlot>) {
    const next = [...slots] as [AppSlot, AppSlot];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  return (
    <div className="cg-col">
      <p className="cg-help">
        PEOPLE (top-left) and MAIL (top-right) are fixed. Choose the apps for the bottom two buttons and what they say. The
        app must be installed on this phone; use “Try it” to check.
      </p>
      {slots.map((slot, idx) => {
        const i = idx as 0 | 1;
        const r = resolveSlot(slot);
        const presetName = (id: string) => APP_PRESETS.find((p) => p.id === id)?.name ?? '';
        return (
          <fieldset key={i} className="cg-slot">
            <legend>{POSITION[i]}</legend>
            <label className="cg-field">
              App
              <select
                aria-label={`${POSITION[i]} app`}
                value={slot.app}
                onChange={(e) => {
                  const app = e.target.value;
                  // Keep a hand-written label; replace one that was just the old app's name.
                  const label = !slot.label.trim() || slot.label === presetName(slot.app) ? presetName(app) : slot.label;
                  update(i, { app, label });
                }}
              >
                {APP_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
                <option value="custom">⭐ Other (enter link)</option>
              </select>
            </label>
            <label className="cg-field col">
              Button label
              <input
                aria-label={`${POSITION[i]} label`}
                maxLength={18}
                value={slot.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </label>
            {slot.app === 'custom' && (
              <label className="cg-field col">
                App link (e.g. appname:// or https://…)
                <input
                  aria-label={`${POSITION[i]} link`}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={slot.customUrl}
                  onChange={(e) => update(i, { customUrl: e.target.value })}
                />
                {slot.customUrl && !safeLaunchUrl(slot.customUrl) && <span className="cg-warn">Not a valid app link.</span>}
              </label>
            )}
            <div className="cg-row">
              <button type="button" className="cg-btn" disabled={!r.url} onClick={() => r.url && launch(r.url)}>
                Try it
              </button>
              <span className="cg-dim">
                {r.icon} “{r.label}” → {r.url ?? 'no link'}
              </span>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
