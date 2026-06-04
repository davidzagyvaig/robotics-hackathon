/*
 * DermaScout pan-tilt firmware — ESP32 + PCA9685 + 2 servos.
 *
 * Implements the serial contract in shared/protocol.py:
 *   HOST -> ESP32:  "P<pan> T<tilt>\n" | "H\n" | "Z\n" | "E\n" | "D\n"
 *   ESP32 -> HOST:  "OK P<pan> T<tilt>\n" | "ST P<pan> T<tilt>\n" | "ERR <code>\n" | "BOOT\n"
 *
 * Safety (the whole point):
 *   - clamp pan/tilt to limits
 *   - slew-limit to MAX_DEG_PER_S (no instant jumps -> no brownout)
 *   - watchdog: no command/heartbeat within WATCHDOG_MS -> go home, "ERR WATCHDOG"
 *
 * Wiring:
 *   ESP32 SDA->PCA9685 SDA, SCL->SCL, GND common with servo PSU.
 *   Servos on a SEPARATE 5.5-6V rail (NOT the ESP32 5V). 1000uF cap across rail.
 *   Pan servo on PCA9685 ch 0, tilt on ch 1.
 *
 * Deps (Arduino Library Manager): "Adafruit PWM Servo Driver Library".
 */

#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

// ---- protocol constants (mirror shared/protocol.py) ----
const float PAN_MIN = -90.0, PAN_MAX = 90.0;
const float TILT_MIN = -45.0, TILT_MAX = 45.0;
const float MAX_DEG_PER_S = 60.0;
const unsigned long WATCHDOG_MS = 250;

// ---- servo / PCA9685 ----
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);
const uint8_t CH_PAN = 0;
const uint8_t CH_TILT = 1;
const int SERVO_FREQ = 50;             // 50 Hz for analog servos
const int PWM_MIN = 150;               // ~1ms pulse  (-90 deg)
const int PWM_MAX = 600;               // ~2ms pulse  (+90 deg)

// ---- state ----
float targetPan = 0, targetTilt = 0;   // commanded
float curPan = 0, curTilt = 0;         // slew-limited actual
bool enabled = true;
unsigned long lastCmdMs = 0;
unsigned long lastStepMs = 0;
unsigned long lastStatusMs = 0;

int angleToPwm(float deg, float lo, float hi) {
  float t = (deg - lo) / (hi - lo);        // 0..1
  if (t < 0) t = 0; if (t > 1) t = 1;
  return (int)(PWM_MIN + t * (PWM_MAX - PWM_MIN));
}

void writeServos() {
  if (!enabled) return;
  pwm.setPWM(CH_PAN, 0, angleToPwm(curPan, PAN_MIN, PAN_MAX));
  pwm.setPWM(CH_TILT, 0, angleToPwm(curTilt, TILT_MIN, TILT_MAX));
}

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

void setup() {
  Serial.begin(115200);
  Wire.begin();
  pwm.begin();
  pwm.setPWMFreq(SERVO_FREQ);
  delay(50);
  writeServos();
  lastCmdMs = millis();
  Serial.println("BOOT");
}

void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;
  char c = line.charAt(0);
  lastCmdMs = millis();

  if (c == 'H') {                       // heartbeat
    return;
  } else if (c == 'Z') {                // home
    targetPan = 0; targetTilt = 0;
  } else if (c == 'E') {                // enable
    enabled = true;
  } else if (c == 'D') {                // disable
    enabled = false;
  } else if (c == 'P') {                // "P<pan> T<tilt>"
    int tIdx = line.indexOf('T');
    if (tIdx < 0) { Serial.println("ERR PARSE"); return; }
    float p = line.substring(1, tIdx).toFloat();
    float t = line.substring(tIdx + 1).toFloat();
    bool clamped = (p < PAN_MIN || p > PAN_MAX || t < TILT_MIN || t > TILT_MAX);
    targetPan = clampf(p, PAN_MIN, PAN_MAX);
    targetTilt = clampf(t, TILT_MIN, TILT_MAX);
    if (clamped) Serial.println("ERR CLAMP");
    Serial.print("OK P"); Serial.print(targetPan, 2);
    Serial.print(" T"); Serial.println(targetTilt, 2);
  } else {
    Serial.println("ERR PARSE");
  }
}

void loop() {
  // read a line
  static String buf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') { handleLine(buf); buf = ""; }
    else if (ch != '\r') buf += ch;
  }

  unsigned long now = millis();

  // watchdog
  if (now - lastCmdMs > WATCHDOG_MS) {
    if (targetPan != 0 || targetTilt != 0) {
      targetPan = 0; targetTilt = 0;
      Serial.println("ERR WATCHDOG");
    }
    lastCmdMs = now;  // avoid spamming
  }

  // slew toward target
  if (now - lastStepMs >= 20) {            // 50 Hz control
    float dt = (now - lastStepMs) / 1000.0;
    lastStepMs = now;
    float maxStep = MAX_DEG_PER_S * dt;
    curPan += clampf(targetPan - curPan, -maxStep, maxStep);
    curTilt += clampf(targetTilt - curTilt, -maxStep, maxStep);
    writeServos();
  }

  // periodic status ~10 Hz
  if (now - lastStatusMs >= 100) {
    lastStatusMs = now;
    Serial.print("ST P"); Serial.print(curPan, 2);
    Serial.print(" T"); Serial.println(curTilt, 2);
  }
}
