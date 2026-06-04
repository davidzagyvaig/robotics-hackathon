/*
 * BrailleBuddy firmware — ESP32-S3 + 6× MG90S servos (direct GPIO) + 1 potentiometer.
 *
 * One braille cell = 6 dots; each dot is raised/lowered by one servo between two
 * hard-coded angles (no closed-loop control). A potentiometer sets the reading speed
 * (mapped to chars/sec on the browser side).
 *
 * Host (browser, WebSerial) <-> ESP over native USB CDC, 115200, '\n'-terminated ASCII.
 * See firmware/PROTOCOL.md for the full contract.
 *   HOST -> ESP:  "ID?"  "B<6 bits>"(e.g. B100000)  "Z"(all down)  "E"(enable)  "D"(relax)
 *   ESP -> HOST:  "BOOT"  "BRAILLEBUDDY v1"  "OK"  "ERR PARSE"  "POT <0-4095>"(~10Hz)
 *
 * Dot / bit order = braille dots 1..6:   1 4 / 2 5 / 3 6   (bit i of the frame = dot i+1)
 *
 * Wiring (see docs/HARDWARE.md): servos on a SEPARATE 5-6V rail (NOT the ESP 5V pin),
 * common ground, 1000uF cap across the rail. Confirm pins against your board.
 */

#include <ESP32Servo.h>

// ---- pins (confirm on your board; avoid USB D-/D+ on 19/20 and strapping 0/3/45/46) ----
const int DOT_PINS[6] = {4, 5, 6, 7, 15, 16}; // dots 1..6
const int POT_PIN = 1;                          // ADC1 channel (potentiometer wiper)

// ---- per-dot calibration: pulse width (microseconds) for DOWN and UP ----
// MG90S ~ 500us(0deg) .. 2400us(180deg). Tune each dot so DOWN sits flush and UP raises cleanly.
int DOWN_US[6] = {1000, 1000, 1000, 1000, 1000, 1000};
int UP_US[6]   = {1600, 1600, 1600, 1600, 1600, 1600};

Servo servos[6];
bool enabled = true;
uint8_t curBits = 0;          // last commanded cell, so E can re-apply it
unsigned long lastPotMs = 0;

void applyCell(uint8_t bits) {
  curBits = bits;
  if (!enabled) return;
  for (int i = 0; i < 6; i++) {
    bool up = bits & (1 << i);                 // bit i -> dot (i+1)
    servos[i].writeMicroseconds(up ? UP_US[i] : DOWN_US[i]);
  }
}

void attachAll() {
  for (int i = 0; i < 6; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(DOT_PINS[i], 500, 2400);
  }
}

void startupWave() {
  // Cosmetic boot animation: raise then lower each dot in turn.
  for (int i = 0; i < 6; i++) {
    servos[i].writeMicroseconds(UP_US[i]);
    delay(110);
    servos[i].writeMicroseconds(DOWN_US[i]);
    delay(50);
  }
}

uint8_t parseBits(const String &s) {
  uint8_t b = 0;
  for (int i = 0; i < 6 && i < (int)s.length(); i++)
    if (s.charAt(i) == '1') b |= (1 << i);
  return b;
}

void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line == "ID?") {
    Serial.println("BRAILLEBUDDY v1");
    return;
  }

  char c = line.charAt(0);
  if (c == 'B') {
    applyCell(parseBits(line.substring(1)));
    Serial.println("OK");
  } else if (c == 'Z') {
    applyCell(0);
    Serial.println("OK");
  } else if (c == 'E') {
    if (!enabled) { enabled = true; attachAll(); applyCell(curBits); }
    Serial.println("OK");
  } else if (c == 'D') {
    enabled = false;
    for (int i = 0; i < 6; i++) servos[i].detach();
    Serial.println("OK");
  } else {
    Serial.println("ERR PARSE");
  }
}

void setup() {
  Serial.begin(115200);
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  attachAll();
  analogReadResolution(12);
  applyCell(0);
  delay(200);
  startupWave();
  applyCell(0);
  Serial.println("BOOT");
}

void loop() {
  // Read a full line from USB serial.
  static String buf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') { handleLine(buf); buf = ""; }
    else if (ch != '\r') buf += ch;
  }

  // Stream the speed knob at ~10 Hz.
  unsigned long now = millis();
  if (now - lastPotMs >= 100) {
    lastPotMs = now;
    int v = analogRead(POT_PIN);
    Serial.print("POT ");
    Serial.println(v);
  }
}
