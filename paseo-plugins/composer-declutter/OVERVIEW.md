Hides rarely used composer controls in Paseo 0.11.4's web and desktop apps. Nothing changes by
 default: all six Hide switches start OFF. Thinking effort, access level/mode, fast mode,
other provider feature toggles, the idle dictation microphone and the idle Voice mode button
can be hidden independently (other provider features share one switch).

Settings → Plugins → composer-declutter → its three-dot actions button → Composer controls.
From a workspace, Command Center (⌘K on Mac, Ctrl+K elsewhere) → Configure composer controls
opens the same screen. This is a plugin settings screen, not a built-in Appearance setting.
Turn a switch ON to hide its control; Reset restores everything to visible. Changes apply in
that window immediately; refresh other already-open web/desktop windows to pick up changes
made elsewhere. Settings are saved on the selected host and survive app refreshes.

Hidden does not mean disabled:
- Thinking, access/mode and fast mode remain in Command Center (search Thinking, Access or Fast).
  These choices were checked live without changing the agent's settings. Plan mode is also
  registered there by Paseo, but arbitrary provider feature toggles are not guaranteed to be.
  To reach an unlisted feature, turn its Hide switch OFF again.
- Paseo's default keyboard shortcuts remain untouched: Shift+Tab cycles mode while the composer
  is focused; ⌘D / Ctrl+D starts/stops dictation; ⌘Shift+D / Ctrl+Shift+D toggles Voice mode.
  These bindings were checked in Paseo's source, not exercised with a live microphone.
- Only the exact English idle labels “Start dictation” and “Enable Voice mode” are hidden.
  Stop/cancel/insert/retry recording controls and active Voice mode mute/unmute controls are
  deliberately never selected. No audio session was started during verification.

Proof from the live web app, 2026-10-19, in screenshots/:
- defaults.webp: unchanged idle composer, with thinking, access, fast mode, microphone and Voice.
- all-hidden.webp: same idle composer with all six Hide switches ON; model and attachment remain.
- settings-all-hidden.webp: all six switches ON.
- settings-defaults.webp: switches restored OFF at the end. All original controls were visible again.

The client only injects a removable CSS stylesheet; it does not edit React-owned controls or
change agent settings. The tiny server entry only registers host-persisted settings: no hooks,
agent actions or background jobs. Unloading the plugin removes its stylesheet immediately.
Disable via Settings → Plugins → composer-declutter, or `paseo plugin disable composer-declutter`.

Limits: iOS/Android appearance is unchanged. Web was verified; desktop uses the same web path but
was not separately opened. Paseo updates that rename test IDs or English labels can stop a rule
matching (controls then remain visible); voice hiding intentionally does not work in other UI
languages. No overflow menu is added. No other provider feature was present in the proof composer.
