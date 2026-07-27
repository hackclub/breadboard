# Test fixtures

Arduino Uno builds produced by the editor backend
(`POST /api/compile/start`, `board_fqbn: arduino:avr:uno`), so the tests drive
the same firmware a user's Run button produces rather than something
hand-assembled. To rebuild either one, compile the sketch below through a
running editor backend and save `result.hex_content` here verbatim.

## analog-read-uno.hex

Prints `X:<analogRead(A0)> Y:<analogRead(A1)>` every 100 ms. Used by
`adcRestart.test.ts` to check an injected analog voltage survives `reset()`.

```cpp
void setup() {
  Serial.begin(9600);
  Serial.println("ready");
}
void loop() {
  int x = analogRead(A0);
  int y = analogRead(A1);
  Serial.print("X:");
  Serial.print(x);
  Serial.print(" Y:");
  Serial.println(y);
  delay(100);
}
```

## rc522-uno.hex

Linked against the real `MFRC522` library. Used by `spiRestart.test.ts`.

```cpp
#include <SPI.h>
#include <MFRC522.h>
#define SS_PIN 10
#define RST_PIN 9
MFRC522 mfrc522(SS_PIN, RST_PIN);
void setup() {
  Serial.begin(9600);
  SPI.begin();
  mfrc522.PCD_Init();
  Serial.println("ready");
}
void loop() {
  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;
  Serial.print("UID:");
  for (byte i = 0; i < mfrc522.uid.size; i++) Serial.print(mfrc522.uid.uidByte[i], HEX);
  Serial.println();
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  delay(300);
}
```

The test only cares that the firmware prints `ready` once per boot and
`UID:DEADBEEF` when it reads the emulated card, so a newer MFRC522 release is
fine as long as those two strings survive.
