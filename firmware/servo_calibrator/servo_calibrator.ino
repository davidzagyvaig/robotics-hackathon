/*
 * ============================================================================
 *  servo_calibrator — 6-servo pin finder + angle finder (BrailleBuddy bench tool)
 * ============================================================================
 *  Two jobs, one sketch:
 *    1. WHICH PIN IS WHICH DOT?  Wiggle one servo at a time and watch which
 *       physical dot moves, so you can map index -> braille dot.
 *    2. WHAT ARE THE ANGLES?     Nudge each servo to its flush (OFF) and raised
 *       (ON) positions, capture them, and copy the printed OFF_ANGLE[]/ON_ANGLE[]
 *       arrays straight into braillebuddy_esp32_arduino.ino.
 *
 *  Index 0..5 = braille dots 1..6 (SERVO_PINS[i] is dot i+1, order 1 4/2 5/3 6).
 *
 *  HOW TO USE
 *    1. Board = "ESP32S3 Dev Module", USB CDC On Boot = Enabled. Upload.
 *    2. Open Serial Monitor @ 115200, line ending = "Newline".
 *    3. Find the pins:  type  w0  w1 ... w5  and note which dot each one moves.
 *       If the order is wrong, reorder SERVO_PINS[] below and re-upload.
 *    4. Find the angles: for each dot ->  s<i>, nudge with + / - (or type an
 *       angle), press  f  at flush and  r  at raised.
 *    5. Type  ?  -> copy the printed arrays into the main firmware.
 *
 *  STANDALONE: flash this instead of the main firmware to tune, then re-flash
 *  braillebuddy_esp32_arduino to go back. Pulse range 500..2400 us matches the
 *  main firmware, so angles map identically.
 *
 *  ---- SERIAL COMMANDS (type, then Enter) ----
 *    s<i>       select servo by INDEX 0..5            (e.g. s0)
 *    <angle>    move the selected servo to 0..180     (e.g. 45)
 *    +  /  -    nudge the selected servo by STEP degrees
 *    w          wiggle the selected servo (spot which dot it is)
 *    w<i>       wiggle servo i without changing the selection (e.g. w3)
 *    a<angle>   move ALL servos to <angle>            (e.g. a20  -> check flush)
 *    f  /  r    capture current angle as this dot's OFF (flush) / ON (raised)
 *    d  /  e    detach (relax) all / re-attach all
 *    ?          print the map + paste-ready OFF_ANGLE[]/ON_ANGLE[] arrays
 * ============================================================================
 */

#include <Arduino.h>
#include <ESP32Servo.h>

// ======================= EDIT THESE =======================
int       SERVO_PINS[6] = {4, 5, 6, 7, 15, 16}; // dots 1..6 (same as main firmware)
int       START_ANGLE   = 20;   // where every servo parks on boot (0..180)
int       STEP          = 2;    // degrees per "+" / "-" nudge
// ==========================================================

const int PULSE_MIN_US = 500;   // matches the main firmware
const int PULSE_MAX_US = 2400;

Servo servos[6];
int   angle[6];                 // current commanded angle per servo
int   offMark[6];               // captured OFF (flush) angle, -1 = not set yet
int   onMark[6];                // captured ON  (raised) angle, -1 = not set yet
int   sel      = 0;             // currently selected servo index
bool  attached = true;

void attachAll() {
  for (int i = 0; i < 6; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(SERVO_PINS[i], PULSE_MIN_US, PULSE_MAX_US);
  }
  attached = true;
}

void detachAll() {
  for (int i = 0; i < 6; i++) servos[i].detach();
  attached = false;
}

// Clamp to 0..180, drive the servo, remember + report the new angle.
void moveTo(int i, int a) {
  a = constrain(a, 0, 180);
  angle[i] = a;
  if (attached) servos[i].write(a);
  Serial.printf("servo %d (dot %d, pin %d) -> %d deg\n", i, i + 1, SERVO_PINS[i], a);
}

// Rock the servo back and forth around its current angle so you can see which
// physical dot it drives. Auto-attaches if servos were relaxed.
void wiggle(int i) {
  if (!attached) attachAll();
  int base = angle[i];
  Serial.printf("wiggle servo %d (dot %d, pin %d)\n", i, i + 1, SERVO_PINS[i]);
  for (int k = 0; k < 3; k++) {
    servos[i].write(constrain(base + 15, 0, 180)); delay(180);
    servos[i].write(constrain(base - 15, 0, 180)); delay(180);
  }
  servos[i].write(base);
  angle[i] = base;
}

void report() {
  Serial.println("---- map / current angles ----");
  for (int i = 0; i < 6; i++) {
    Serial.printf("  [%d] dot %d  pin %2d   angle %3d   off %s   on %s%s\n",
      i, i + 1, SERVO_PINS[i], angle[i],
      offMark[i] < 0 ? "--" : String(offMark[i]).c_str(),
      onMark[i]  < 0 ? "--" : String(onMark[i]).c_str(),
      i == sel ? "   <- selected" : "");
  }
  // Paste-ready arrays. Falls back to the live angle for any dot not captured.
  Serial.print("int OFF_ANGLE[6] = {");
  for (int i = 0; i < 6; i++)
    Serial.printf("%d%s", offMark[i] < 0 ? angle[i] : offMark[i], i < 5 ? ", " : "");
  Serial.println("};");
  Serial.print("int ON_ANGLE[6]  = {");
  for (int i = 0; i < 6; i++)
    Serial.printf("%d%s", onMark[i] < 0 ? angle[i] : onMark[i], i < 5 ? ", " : "");
  Serial.println("};");
  Serial.println("------------------------------");
}

void printHelp() {
  Serial.println();
  Serial.println("== BrailleBuddy servo calibrator ==");
  Serial.println("  s<i>      select servo index 0..5      (e.g. s0)");
  Serial.println("  <angle>   move selected servo 0..180   (e.g. 45)");
  Serial.println("  + / -     nudge selected by STEP deg");
  Serial.println("  w         wiggle selected (spot which dot)");
  Serial.println("  w<i>      wiggle servo i");
  Serial.println("  a<angle>  move ALL servos to angle     (e.g. a20)");
  Serial.println("  f / r     capture current as this dot's OFF / ON");
  Serial.println("  d / e     detach(relax) / re-attach all");
  Serial.println("  ?         show map + paste-ready arrays");
}

void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;
  String lc = line;
  lc.toLowerCase();

  // --- exact single-key commands ---
  if (lc == "?") { report(); return; }
  if (lc == "+") { moveTo(sel, angle[sel] + STEP); return; }
  if (lc == "-") { moveTo(sel, angle[sel] - STEP); return; }
  if (lc == "w") { wiggle(sel); return; }
  if (lc == "f") { offMark[sel] = angle[sel]; Serial.printf("captured dot %d OFF = %d\n", sel + 1, angle[sel]); return; }
  if (lc == "r") { onMark[sel]  = angle[sel]; Serial.printf("captured dot %d ON  = %d\n", sel + 1, angle[sel]); return; }
  if (lc == "d") { detachAll(); Serial.println("detached (relaxed) all servos"); return; }
  if (lc == "e") { attachAll(); for (int i = 0; i < 6; i++) servos[i].write(angle[i]); Serial.println("re-attached all servos"); return; }

  char c = lc.charAt(0);

  // --- commands with an argument ---
  if (c == 's') {                                   // select: s2 or s 2
    int i = line.substring(1).toInt();
    if (i >= 0 && i <= 5) { sel = i; Serial.printf("selected servo %d (dot %d, pin %d)\n", sel, sel + 1, SERVO_PINS[sel]); }
    else Serial.println("ERR: index must be 0..5");
    return;
  }
  if (c == 'w') {                                   // wiggle i: w3 or w 3
    int i = line.substring(1).toInt();
    if (i >= 0 && i <= 5) wiggle(i);
    else Serial.println("ERR: index must be 0..5");
    return;
  }
  if (c == 'a') {                                   // all to angle: a20
    int a = constrain(line.substring(1).toInt(), 0, 180);
    for (int i = 0; i < 6; i++) moveTo(i, a);
    return;
  }
  if (c >= '0' && c <= '9') {                        // bare angle -> selected servo
    moveTo(sel, line.toInt());
    return;
  }

  Serial.println("ERR: unknown command — type ? for help");
}

void setup() {
  Serial.begin(115200);

  // ESP32Servo timer setup (same as the main firmware).
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  for (int i = 0; i < 6; i++) { angle[i] = START_ANGLE; offMark[i] = -1; onMark[i] = -1; }
  attachAll();
  delay(200);
  for (int i = 0; i < 6; i++) servos[i].write(START_ANGLE);

  printHelp();
  Serial.println("Ready.");
  report();
}

void loop() {
  static String buf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') { handleLine(buf); buf = ""; }
    else if (ch != '\r') buf += ch;
  }
}
