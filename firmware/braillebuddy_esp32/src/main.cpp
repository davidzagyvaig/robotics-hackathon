/*
 * ============================================================================
 *  BrailleBuddy firmware (full) — ESP32-S3
 * ============================================================================
 *  ONE self-contained sketch. Drop-in upgrade for src/main.cpp.
 *
 *  HOW TO FLASH
 *    - Arduino IDE: open this file directly (board = "ESP32S3 Dev Module",
 *      USB CDC On Boot = Enabled), then Upload.
 *    - PlatformIO: replace the contents of src/main.cpp with this file
 *      (PlatformIO only compiles files under src/). platformio.ini already
 *      has -DARDUINO_USB_CDC_ON_BOOT=1 and the ESP32Servo lib, which is all
 *      this needs — BLE is part of the arduino-esp32 core, no extra lib_deps.
 *
 *  WHAT IT DOES
 *    - Drives 6 servos, one per braille dot, between a calibratable OFF angle
 *      (dot down/flush) and ON angle (dot raised). On/off only; the SWEEP SPEED
 *      between them is set ONLY by the potentiometer. From that speed the box
 *      computes how long one cell takes to fully change and streams that back
 *      (CHARMS) so the app knows how fast it may send characters.
 *    - Pulses a haptic motor every time a NEW braille cell (letter) is shown.
 *    - Reads a capacitive touch button: single tap and double tap are reported
 *      to the host (TOUCH 1 / TOUCH 2) so the app can read notifications aloud
 *      or step through them one-by-one in braille.
 *    - The 2-prong physical switch is read and reported (SW 0/1) but currently
 *      reserved. The box advertises ONE BLE name ("BrailleBuddy") and accepts a
 *      single connection at a time (USB or BLE), re-advertising on disconnect.
 *    - Talks the SAME line protocol over USB serial AND Bluetooth LE.
 *
 *  Dot / bit order = braille dots 1..6:   1 4 / 2 5 / 3 6
 *  (bit i of the 6-bit frame = dot i+1). e.g. B100000 = dot 1 = "a".
 *
 *  ---- LINE PROTOCOL (115200 baud over USB; same lines over BLE NUS) ----
 *  HOST -> DEVICE
 *    ID?               identify        -> "BRAILLEBUDDY v2"
 *    B<6 bits>         set cell (+haptic pulse), e.g. B101100
 *    Z                 lower every dot (no haptic)
 *    E                 enable / re-attach the servos
 *    D                 relax (detach) servos so they stop buzzing/heating
 *    H                 fire one haptic pulse now (test)
 *    CON <dot> <ang>   calibrate ON angle  of a dot (dot 1-6, ang 0-180)
 *    COFF <dot> <ang>  calibrate OFF angle of a dot (dot 1-6, ang 0-180)
 *    C?                dump current calibration + speed
 *  DEVICE -> HOST
 *    BOOT                          firmware started
 *    BRAILLEBUDDY v2               identity (reply to ID?)
 *    OK / ERR PARSE                ack / unknown command
 *    POT <0-4095>      ~10 Hz      raw speed-knob reading (kept for compat)
 *    SPEED <0-100>     ~10 Hz      pot-set switching speed percent
 *    CHARMS <ms>       ~10 Hz      ms for ONE cell to fully change at the current
 *                                  speed = the minimum delay the app should wait
 *                                  between characters (rate = 1000 / CHARMS cps)
 *    TOUCH 1 / TOUCH 2             single / double tap on the touch button
 *    SW 0 / SW 1                   physical toggle switch changed state (reserved)
 *
 *  ---- WIRING (the #1 risk is servo power — get it right first) ----
 *    - 6 servos on a DEDICATED 5-6V rail, NOT the ESP 5V/3V3 pin. Common GND
 *      between that supply and the ESP32-S3. 1000uF cap across the servo rail.
 *    - Haptic motor: its little driver board's IN pin -> HAPTIC_PIN, plus VCC
 *      and GND. We just switch it on/off (digital). Set HAPTIC_ACTIVE_HIGH to
 *      match your driver.
 *    - Capacitive touch module (e.g. TTP223): VCC -> 3V3, GND -> GND,
 *      SIG -> TOUCH_PIN. Set TOUCH_ACTIVE_HIGH to match (TTP223 idles LOW,
 *      goes HIGH on touch -> leave it true).
 *    - Physical 2-prong toggle: one prong -> SWITCH_PIN, other prong -> GND.
 *      We use the internal pull-up, so "closed" reads LOW.
 *    - Potentiometer: outer pins -> 3V3 and GND, wiper -> POT_PIN (ADC1).
 * ============================================================================
 */

#include <Arduino.h>
#include <ESP32Servo.h>

// ===========================================================================
//  CONFIG — everything you might want to change lives here.
// ===========================================================================

// ---- Pins (all freely choosable; avoid USB pins 19/20 and strapping 0/3/45/46) ----
const int SERVO_PINS[6] = {4, 5, 6, 7, 15, 16}; // dots 1..6
const int POT_PIN       = 1;   // potentiometer wiper -> ADC1 (speed knob)
const int HAPTIC_PIN    = 17;  // haptic driver IN (on/off)
const int TOUCH_PIN     = 18;  // capacitive touch module SIG
const int SWITCH_PIN    = 8;   // 2-prong toggle: other prong to GND

// ---- Per-dot angle calibration (degrees, 0..180). Editable live via CON/COFF. ----
//  OFF = dot flush/down, ON = dot raised. Tune each dot so down is flush and up
//  is a crisp readable dot without the servo straining.
int OFF_ANGLE[6] = {20, 20, 20, 20, 20, 20};
int ON_ANGLE[6]  = {40, 40, 40, 40, 40, 40};

// ---- Switching-speed calibration ----
//  speedPct (0..100) is mapped to "degrees moved per servo update". Small step =
//  slow, smooth sweep; big step = near-instant snap. Tune these to taste — they
//  define what 0% and 100% physically mean. The live speed comes ONLY from the pot.
const int   SERVO_UPDATE_MS = 15;  // how often we nudge the servos (~servo frame)
const float MIN_STEP_DEG    = 1.0; // degrees/update at speed = 0%   (slowest)
const float MAX_STEP_DEG    = 90.0;// degrees/update at speed = 100% (snap)
int speedPct = 60;                 // boot default; the pot sets it every cycle

// ---- Haptic ----
const bool HAPTIC_ACTIVE_HIGH = true; // flip if your driver turns on with LOW
const int  HAPTIC_MS          = 60;   // buzz length per new letter

// ---- Capacitive touch ----
const bool TOUCH_ACTIVE_HIGH  = true; // TTP223 default: HIGH while touched
const unsigned long TOUCH_DEBOUNCE_MS = 30;
const unsigned long DOUBLE_TAP_MS     = 350; // 2nd tap within this = double tap

// ---- Physical switch ----
const unsigned long SWITCH_DEBOUNCE_MS = 40;

// ---- Bluetooth LE (Nordic UART Service). Set to 0 to build USB-serial only. ----
#define USE_BLE 1
//  The box advertises ONE name and accepts a single connection at a time (USB or
//  BLE). On disconnect it re-advertises so the next host can connect.
const char* BLE_NAME = "BrailleBuddy";

// ===========================================================================
//  Transport: send a line to USB serial AND (if connected) BLE.
// ===========================================================================
#if USE_BLE
  #include <BLEDevice.h>
  #include <BLEServer.h>
  #include <BLEUtils.h>
  #include <BLE2902.h>
  // Nordic UART Service UUIDs (the web app's Web Bluetooth code uses these).
  #define NUS_SERVICE   "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
  #define NUS_RX_CHAR   "6E400002-B5A3-F393-E0A9-E50E24DCCA9E" // host -> device (write)
  #define NUS_TX_CHAR   "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // device -> host (notify)
  static BLEServer*         bleServer = nullptr;
  static BLECharacteristic* txChar = nullptr;
  static volatile bool bleConnected = false;
  static volatile uint16_t bleConnId = 0;
  static String bleRxBuf;
#endif

void handleLine(String line); // fwd decl

void sendLine(const String& s) {
  Serial.println(s);
#if USE_BLE
  if (bleConnected && txChar) {
    String t = s + "\n";
    txChar->setValue((uint8_t*)t.c_str(), t.length());
    txChar->notify();
  }
#endif
}

#if USE_BLE
// (Re)build the advertising packet for the single BrailleBuddy identity.
void applyAdvertising() {
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->stop();
  esp_ble_gap_set_device_name(BLE_NAME);
  BLEAdvertisementData ad;
  ad.setName(BLE_NAME);
  ad.setCompleteServices(BLEUUID(NUS_SERVICE));
  adv->setAdvertisementData(ad);
  BLEAdvertisementData sr;                 // scan-response also carries the name
  sr.setName(BLE_NAME);
  adv->setScanResponseData(sr);
  adv->start();
}

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* s, esp_ble_gatts_cb_param_t* param) override {
    bleConnected = true;
    bleConnId = param->connect.conn_id;
  }
  void onDisconnect(BLEServer* s) override {
    bleConnected = false;
    applyAdvertising();      // re-advertise to whichever device is now selected
  }
};
class RxCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    std::string v = c->getValue();
    for (char ch : v) {
      if (ch == '\n') { handleLine(bleRxBuf); bleRxBuf = ""; }
      else if (ch != '\r') bleRxBuf += ch;
    }
  }
};

void startBLE() {
  BLEDevice::init(BLE_NAME);
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCB());
  BLEService* svc = bleServer->createService(NUS_SERVICE);
  txChar = svc->createCharacteristic(NUS_TX_CHAR, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  BLECharacteristic* rx = svc->createCharacteristic(NUS_RX_CHAR,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(new RxCB());
  svc->start();
  applyAdvertising();
}
#endif

// ===========================================================================
//  Servos
// ===========================================================================
Servo servos[6];
bool  enabled = true;
uint8_t curBits = 0;       // last commanded cell (so E can re-apply it)
float curAngle[6];         // live angle, swept toward target each update

void attachAll() {
  for (int i = 0; i < 6; i++) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(SERVO_PINS[i], 500, 2400);
  }
}

// Set which dots are up; `buzz` fires the haptic (true only for real letters).
void applyCell(uint8_t bits, bool buzz);

void updateServos() {
  static unsigned long last = 0;
  unsigned long now = millis();
  if (now - last < (unsigned long)SERVO_UPDATE_MS) return;
  last = now;
  if (!enabled) return;
  float step = MIN_STEP_DEG + (MAX_STEP_DEG - MIN_STEP_DEG) *
               (constrain(speedPct, 0, 100) / 100.0f);
  for (int i = 0; i < 6; i++) {
    float tgt = (curBits & (1 << i)) ? (float)ON_ANGLE[i] : (float)OFF_ANGLE[i];
    if (curAngle[i] < tgt)      curAngle[i] = min(tgt, curAngle[i] + step);
    else if (curAngle[i] > tgt) curAngle[i] = max(tgt, curAngle[i] - step);
    servos[i].write((int)lroundf(curAngle[i]));
  }
}

// ===========================================================================
//  Haptic motor (non-blocking pulse)
// ===========================================================================
unsigned long hapticOffAt = 0;

void hapticWrite(bool on) {
  digitalWrite(HAPTIC_PIN, (on == HAPTIC_ACTIVE_HIGH) ? HIGH : LOW);
}
void hapticPulse() { hapticWrite(true); hapticOffAt = millis() + HAPTIC_MS; }
void updateHaptic() {
  if (hapticOffAt && (long)(millis() - hapticOffAt) >= 0) {
    hapticWrite(false);
    hapticOffAt = 0;
  }
}

void applyCell(uint8_t bits, bool buzz) {
  curBits = bits;
  if (buzz) hapticPulse(); // new letter -> a little nudge
  // updateServos() will sweep to the new target; nothing blocking here.
}

// ===========================================================================
//  Capacitive touch — single vs double tap
// ===========================================================================
bool          touchStable = false;       // debounced "is touched"
bool          touchRaw    = false;
unsigned long touchEdgeAt = 0;
bool          awaitingSecondTap = false;
unsigned long firstTapAt = 0;

void updateTouch() {
  unsigned long now = millis();
  bool raw = (digitalRead(TOUCH_PIN) == HIGH) == TOUCH_ACTIVE_HIGH;
  if (raw != touchRaw) { touchRaw = raw; touchEdgeAt = now; }
  if (now - touchEdgeAt >= TOUCH_DEBOUNCE_MS && raw != touchStable) {
    touchStable = raw;
    if (touchStable) { // a fresh press (rising edge)
      if (awaitingSecondTap && (now - firstTapAt <= DOUBLE_TAP_MS)) {
        sendLine("TOUCH 2");
        awaitingSecondTap = false;
      } else {
        awaitingSecondTap = true;
        firstTapAt = now;
      }
    }
  }
  // First tap not followed by a second within the window -> it was a single tap.
  if (awaitingSecondTap && (now - firstTapAt > DOUBLE_TAP_MS)) {
    sendLine("TOUCH 1");
    awaitingSecondTap = false;
  }
}

// ===========================================================================
//  Physical 2-prong switch
// ===========================================================================
int           swStable = -1;     // -1 = unknown at boot
int           swRaw     = -1;
unsigned long swEdgeAt  = 0;

void updateSwitch() {
  unsigned long now = millis();
  int raw = (digitalRead(SWITCH_PIN) == LOW) ? 1 : 0; // pull-up: closed = LOW = 1
  if (raw != swRaw) { swRaw = raw; swEdgeAt = now; }
  if (now - swEdgeAt >= SWITCH_DEBOUNCE_MS && raw != swStable) {
    swStable = raw;
    sendLine(String("SW ") + swStable);   // reported but currently reserved
  }
}

// ===========================================================================
//  Potentiometer -> speed, and the resulting per-cell timing for the app.
// ===========================================================================

// How long ONE cell takes to fully change at the current speed. The slowest dot
// is the one with the biggest OFF<->ON span; updateServos() moves it in
// ceil(span/step) updates, each SERVO_UPDATE_MS long. So this number is exactly
// the settle time the app must wait before sending the next character. It tracks
// both the pot (via step) and your angle calibration (via span) automatically.
int cellChangeMs() {
  int maxSpan = 1;
  for (int i = 0; i < 6; i++) {
    int span = abs(ON_ANGLE[i] - OFF_ANGLE[i]);
    if (span > maxSpan) maxSpan = span;
  }
  float step = MIN_STEP_DEG + (MAX_STEP_DEG - MIN_STEP_DEG) *
               (constrain(speedPct, 0, 100) / 100.0f);
  if (step < 0.01f) step = 0.01f;
  int updates = (int)ceilf(maxSpan / step);
  if (updates < 1) updates = 1;
  return updates * SERVO_UPDATE_MS;
}

void updatePotAndSpeed() {
  static unsigned long lastMs = 0;
  unsigned long now = millis();
  if (now - lastMs < 100) return; // ~10 Hz
  lastMs = now;
  int raw = analogRead(POT_PIN);
  speedPct = (int)((raw / 4095.0f) * 100.0f); // the pot is the ONLY speed control
  sendLine(String("POT ") + raw);             // raw knob value (kept for compat)
  sendLine(String("SPEED ") + speedPct);      // switching speed percent
  sendLine(String("CHARMS ") + cellChangeMs()); // ms per cell -> app paces sending
}

// ===========================================================================
//  Command parsing
// ===========================================================================
uint8_t parseBits(const String& s) {
  uint8_t b = 0;
  for (int i = 0; i < 6 && i < (int)s.length(); i++)
    if (s.charAt(i) == '1') b |= (1 << i);
  return b;
}

void dumpCalibration() {
  for (int i = 0; i < 6; i++) {
    sendLine("CAL " + String(i + 1) + " off " + OFF_ANGLE[i] + " on " + ON_ANGLE[i]);
  }
  sendLine(String("SPEED ") + speedPct);
}

void handleLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line == "ID?")     { sendLine("BRAILLEBUDDY v2"); return; }
  if (line == "C?")      { dumpCalibration(); return; }

  char c = line.charAt(0);

  if (c == 'B') {
    applyCell(parseBits(line.substring(1)), true);   // real letter -> haptic
    sendLine("OK");

  } else if (c == 'Z') {
    applyCell(0, false);                             // clear, no haptic
    sendLine("OK");

  } else if (c == 'E') {
    if (!enabled) { enabled = true; attachAll(); }
    sendLine("OK");

  } else if (c == 'D') {
    enabled = false;
    for (int i = 0; i < 6; i++) servos[i].detach();
    sendLine("OK");

  } else if (c == 'H') {                             // manual haptic test
    hapticPulse();
    sendLine("OK");

  } else if (line.startsWith("CON ") || line.startsWith("COFF ")) {
    // CON <dot 1-6> <angle 0-180>  /  COFF <dot 1-6> <angle 0-180>
    bool isOn = line.startsWith("CON ");
    String rest = line.substring(isOn ? 4 : 5);
    rest.trim();
    int sp = rest.indexOf(' ');
    if (sp < 0) { sendLine("ERR PARSE"); return; }
    int dot = rest.substring(0, sp).toInt();
    int ang = constrain(rest.substring(sp + 1).toInt(), 0, 180);
    if (dot < 1 || dot > 6) { sendLine("ERR PARSE"); return; }
    if (isOn) ON_ANGLE[dot - 1] = ang; else OFF_ANGLE[dot - 1] = ang;
    sendLine("OK");

  } else {
    sendLine("ERR PARSE");
  }
}

// ===========================================================================
//  Setup / loop
// ===========================================================================
void startupWave() {
  for (int i = 0; i < 6; i++) {
    servos[i].write(ON_ANGLE[i]);  curAngle[i] = ON_ANGLE[i];
    delay(110);
    servos[i].write(OFF_ANGLE[i]); curAngle[i] = OFF_ANGLE[i];
    delay(50);
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(HAPTIC_PIN, OUTPUT); hapticWrite(false);
  pinMode(TOUCH_PIN, TOUCH_ACTIVE_HIGH ? INPUT : INPUT_PULLUP);
  pinMode(SWITCH_PIN, INPUT_PULLUP);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  for (int i = 0; i < 6; i++) curAngle[i] = OFF_ANGLE[i];
  attachAll();
  analogReadResolution(12);

  // Read the switch once at boot (reported as SW; currently reserved).
  swStable = (digitalRead(SWITCH_PIN) == LOW) ? 1 : 0;
  swRaw = swStable;
#if USE_BLE
  startBLE();
#endif

  applyCell(0, false);
  delay(200);
  startupWave();
  applyCell(0, false);
  sendLine("BOOT");
}

void loop() {
  // USB serial input -> assemble lines.
  static String buf;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n') { handleLine(buf); buf = ""; }
    else if (ch != '\r') buf += ch;
  }

  updateServos();
  updateHaptic();
  updateTouch();
  updateSwitch();
  updatePotAndSpeed();
}
