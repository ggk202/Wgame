// Recorded sound effects (CC0 / CC-BY, see sounds/CREDITS.md). The single-file build inlines these as data: URIs.
export const SOUND_URLS = {
  pdc: 'sounds/pdc.mp3',                     // Phalanx CIWS fast burst (trimmed to burst + tail)
  consoleStart: 'sounds/console_start.mp3',  // computer start-up: power thunk and spin-up whine
  consoleLoop: 'sounds/console_loop.mp3',    // computer start-up: steady running section, crossfaded into a loop
  alarm: 'sounds/alarm.mp3',                 // malfunction / damage alarm, four tones
  alarmBeep: 'sounds/alarm_beep.mp3',        // one tone of the same alarm
  engine: 'sounds/engine_loop.mp3',          // large rocket engine, steady section looped (0.1 s margins each side)
};
