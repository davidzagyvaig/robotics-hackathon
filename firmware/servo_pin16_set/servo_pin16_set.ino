/*
 * ============================================================================
 *  servo_pin16_set — minimal single-servo positioner (BrailleBuddy bench tool)
 * ============================================================================
 *  Drives ONE servo to a fixed orientation you set in code. Default pin is
 *  GPIO 16, which is braille dot 6 in the main firmware
 *  (SERVO_PINS[6] = {4, 5, 6, 7, 15, 16} -> index 5 = pin 16 = dot 6).
 *
 *  HOW TO USE
 *    1. Edit TARGET_ANGLE below (0..180) — this is the "overwritable in code"
 *       orientation. (Optionally change SERVO_PIN to test a different dot.)
 *    2. Board = "ESP32S3 Dev Module", USB CDC On Boot = Enabled. Upload.
 *    3. On boot the servo snaps to TARGET_ANGLE and holds it.
 *
 *  BONUS (no re-flash needed): with the Serial Monitor open at 115200 baud,
 *  type a number 0..180 + Enter to reposition the servo live.
 *
 *  NOTE: this is a STANDALONE sketch — flash it instead of the main firmware to
 *  bench-test the servo, then re-flash braillebuddy_esp32_arduino to go back.
 *  Needs the same ESP32Servo library as the main firmware. Pulse range
 *  500..2400 us matches the main firmware so the angle maps identically.
 * ============================================================================
 */

#include <Arduino.h>
#include <ESP32Servo.h>

// ======================= EDIT THESE =======================
int       TARGET_ANGLE = 90;   // desired orientation in degrees, 0..180  <-- overwrite me
const int SERVO_PIN    = 7;   // GPIO 16 = braille dot 6 (see SERVO_PINS[] in main firmware)
// ==========================================================

Servo servo;

// Clamp to 0..180, drive the servo, remember + report the new angle.
void moveTo(int angle) {
  angle = constrain(angle, 0, 180);
  TARGET_ANGLE = angle;
  servo.write(angle);
  Serial.printf("Servo on GPIO %d -> %d deg\n", SERVO_PIN, angle);
}

void setup() {
  Serial.begin(115200);

  // ESP32Servo timer setup (same as the main firmware).
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  servo.setPeriodHertz(50);
  servo.attach(SERVO_PIN, 500, 2400);   // 500..2400 us matches the main firmware

  delay(200);
  moveTo(TARGET_ANGLE);                  // apply the code-set orientation
  Serial.println("Ready. Type an angle 0..180 + Enter to move (or edit TARGET_ANGLE and re-upload).");
}

void loop() {
  // Optional live override: read an angle (0..180) typed in the Serial Monitor.
  static String buf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      buf.trim();
      if (buf.length()) { moveTo(buf.toInt()); buf = ""; }
    } else {
      buf += ch;
    }
  }
}
