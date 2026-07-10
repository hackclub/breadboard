# Potentiometer LED Dimmer (with Button Toggle)

## Table of Contents

- [Potentiometer LED Dimmer (with Button Toggle)](#potentiometer-led-dimmer-with-button-toggle)
  - [Table of Contents](#table-of-contents)
  - [What You Will Build](#what-you-will-build)
  - [Getting Started](#getting-started)
  - [Adding the Breadboard](#adding-the-breadboard)
  - [Electricity Basics](#electricity-basics)
    - [What "ground" actually means here](#what-ground-actually-means-here)
  - [Adding the LED](#adding-the-led)
    - [The theory behind it](#the-theory-behind-it)
      - [What voltage is, and why it matters](#what-voltage-is-and-why-it-matters)
      - [What current is, and why it matters](#what-current-is-and-why-it-matters)
      - [Why too much current is bad](#why-too-much-current-is-bad)
      - [So what causes too much current?](#so-what-causes-too-much-current)
  - [How can I calculate the value I need on my resistor?](#how-can-i-calculate-the-value-i-need-on-my-resistor)
    - [**How resistor values are chosen**](#how-resistor-values-are-chosen)
  - [Making It Controllable (PWM)](#making-it-controllable-pwm)
    - [The theory behind it](#the-theory-behind-it-1)
  - [Adding the Potentiometer](#adding-the-potentiometer)
    - [The theory behind it](#the-theory-behind-it-2)
  - [Adding the Button](#adding-the-button)
    - [The theory behind it](#the-theory-behind-it-3)
  - [Writing the Firmware](#writing-the-firmware)
    - [Naming the pins](#naming-the-pins)
    - [Tracking the state](#tracking-the-state)
    - [setup(): configure the pins once](#setup-configure-the-pins-once)
    - [Reading the knob to set brightness](#reading-the-knob-to-set-brightness)
    - [Reading the button to toggle the LED](#reading-the-button-to-toggle-the-led)
    - [The full sketch](#the-full-sketch)
  - [What's Next](#whats-next)

---

## What You Will Build

By the end of this tutorial, you'll have wired up a potentiometer that dims an LED and a button that switches it on and off, all on an Arduino Uno.

> Turn the knob to set how bright the LED glows, and press the button to switch it on or off. When you turn it back on, it remembers your brightness setting.


---

## Getting Started

Click **New Project**.

![create-project-screen](https://cdn.hackclub.com/019f3a4b-4642-7ab7-bb12-3a0439a54da8/paste-1783389438456.png)

Create the project and give it a description. Here I said:

> Turn the knob to set how bright the LED glows, and press the button to switch it on or off. When you turn it back on, it remembers your brightness setting.

Share your whole screen while you record your demo. This is how you get credited for your work and journaling. It shows the effort and the process that went into your build, beyond the finished result.

---

## Adding the Breadboard

Click **+ Add** in the top-right corner to add a breadboard for your connections.

A breadboard lets you build circuits **without soldering**.

- Each **row** of holes is electrically connected **horizontally**.
- The long side rails run down the edges for **power** (Voltage and GND). The Uno gives you both **3V3** and **5V** to feed them.
- The center gap separates the left and right halves.

So if two metal legs sit in the same row, electricity can flow between them.

![Breadboard Annotated](https://cdn.hackclub.com/019d1727-d909-7ddc-8dc8-01e7eed06d3f/image.png)

Then I connected the power rails like so:

![power rails](https://cdn.hackclub.com/019f403e-605a-7cb2-8d8b-d4e87ef56662/paste-1783489256202.png)

You don't need to do it exactly like this. I did it this way because it's typical to make one rail 3V3 + GND and the other rail 5V + GND. I also tried to keep the wires readable.

Why set up two different voltage rails?

> The Arduino Uno gives you both a **5V** pin and a **3.3V** pin, and they share the same **GND**. By running one rail at 5V and the other at 3V3 (both tied to ground), you have *both* voltages sitting right there on the board.
>
> That means when you add a component, you just grab whichever rail matches what it needs, no rewiring your power section every time.
>
> - **5V** is the Uno's main logic voltage (it's a 5V board).
> - **3V3** is a lower rail for parts that can't handle 5V.
>
> Ground is shared across everything, because every component needs a **common reference point** to measure voltage against. Without a shared ground there's no return path, and nothing works.

## Electricity Basics

### What "ground" actually means here

Ground is the **reference point** for the entire circuit.
Think of it as the **zero level** that everything else is measured against.

- Voltage is always measured **relative to ground**.
- Current flows **from power → through components → back to ground**.
- Without ground, the circuit has **no return path**, so nothing works.

Ground isn't "negative energy"; it's simply the **other side of the loop**.

[Check this for more information!](https://www.build-electronic-circuits.com/what-is-ground/)

Additionally, here's some ground!

![grass](https://cdn.hackclub.com/019d1727-e9bb-75dc-87a9-4cf6c6538862/image.png)

---

## Adding the LED

I added an LED directly onto the 5V rail:

![LED burnout](https://cdn.hackclub.com/019f4048-3f8d-720f-8235-67691fab4add/paste-1783489903022.png)

...and it immediately burned out! The cause is all about voltage and current.

### The theory behind it

#### What voltage is, and why it matters

Voltage is the **electrical pressure** that pushes electrons through the circuit.

- Higher voltage = stronger push
- Lower voltage = weaker push

For an LED:

- Too **low** voltage → LED won't turn on
- Too **high** voltage → LED tries to pull too much current and burns out

Voltage matters because every component is designed to operate within a certain range.

[Check this for more information!](https://battlebornbatteries.com/what-are-volts/?srsltid=AfmBOoq2a-NWzu9QzU4y2rCSIqEydhqyE-QsEUiqbilRdl8T43YO8uKB)

![low-voltage-1.webp](https://cdn.hackclub.com/019d1727-ec23-73ad-9ac5-0373f6347d5d/image.png)

#### What current is, and why it matters

Current is the **amount of electrical flow** through the circuit.

- Voltage is the push
- Current is the flow caused by that push

LEDs are **current‑sensitive** devices.
They don't care much about voltage; they care about **how much current flows through them**.

#### Why too much current is bad

If you let too much current flow:

- The LED overheats
- The semiconductor junction gets damaged
- It permanently burns out

This is why you add a **resistor;** it limits current to a safe level.

#### So what causes too much current?

**The *reason* too much current happens is because the *voltage* is too high.**

Voltage is the **push**.
If the push is too strong, the LED is *forced* to draw more current than it can survive.

So the real chain is:

**Too much voltage → too much current → LED damage**

The resistor fixes this by dropping voltage and limiting current so the LED only gets what it can safely handle.

A tiny straw (LED) can only handle a small flow.
If you crank up the pressure (voltage), the straw bursts.
But having a huge bucket of water (a power supply capable of lots of current) is harmless. The straw only takes what it can.

![electrician-electric-shock.gif](https://cdn.hackclub.com/019d1725-77f0-7227-9fba-a307b522ab4f/electrician-electric-shock.gif)

So I added a **220Ω resistor** in series to limit the current:

![resistor added](https://cdn.hackclub.com/019f405d-f455-7b96-a403-8ec4069f66a8/paste-1783491325530.png)

Now that the LED and resistor are in, the circuit is a complete loop. Trace the current the whole way around and it looks like this:

**5V rail → resistor → LED anode (long leg) → LED cathode (short leg) → GND rail → back to the Uno**

The **5V rail** is the source, the **resistor** drops some voltage to keep the current safe, the LED lights as current passes through it from anode to cathode, and the **GND rail** carries everything back to the Arduino to close the loop. Break any hop, like a leg in the wrong row or the LED flipped around, and the loop never completes, so the LED stays dark.

## How can I calculate the value I need on my resistor?

Great question! 

You only need **three numbers**:

1. **Supply voltage** (what your power source provides)
2. **LED forward voltage** (how much voltage the LED "drops")
3. **Desired LED current** (usually 10–20 mA for typical LEDs, ill use 20mA!)

![download.png](https://cdn.hackclub.com/019d172b-7dbf-735d-8073-1cbba9bfae6c/image.png)

![led-resistor-calculator-1-1-800x371.png](https://cdn.hackclub.com/019d172b-804e-713d-a111-8e0e22c9f958/image.png)

However, this is only the minimum-needed! More can be added to be on the safe-side, or have a dimmer LED:

![image.png](https://cdn.hackclub.com/019d172b-82b1-7d4c-a6c1-83e74288ca5d/image.png)

Here's a table of the values you may need:

| **LED Color** | **Typical Forward Voltage** V_LED | **Target Current** |
| --- | --- | --- |
| **Red** | 2.0 V | 20 mA |
| **Yellow** | 2.1 V | 20 mA |
| **Green** | 2.2 V | 20 mA |
| **Blue** | 3.0 V | 20 mA |
| **White** | 3.0 V | 20 mA |

For this example, I will be using a red LED. **For your schematic, use a different color!**

R = (V_supply − V_f) / I

Plug in the values:
R = (5V − 2.0V) / 20mA
R = 3V / 0.02A
R = 150Ω

So the **minimum resistor value** we want is **150Ω**.

### **How resistor values are chosen**

Real resistors only come in standard values. The way these values are chosen is really interesting! You should read about it [here](https://eepower.com/resistor-guide/resistor-standards-and-codes/resistor-values/)!
Your kit includes:

10Ω, 100Ω, 220Ω, 330Ω, 1KΩ, 2KΩ, 5KΩ, 10KΩ, 100KΩ, 1MΩ

We calculated **150Ω**, but the kit does **not** include 150Ω.

So we choose the **next higher safe value**:

- 100Ω → too low (too much current)
- 220Ω → safe choice

**Minimum (calculated): 150Ω** 

**Value used from the kit: 220Ω**

> **LED polarity matters!** The **anode (long leg)** goes toward the positive side (through the resistor), and the **cathode (short leg)** goes toward ground. Flip it and nothing lights up.

---

## Making It Controllable (PWM)

Right now the LED is on all the time. But I don't want it glowing at full brightness 24/7, my eyes hurt :(

Since I want the brightness to be **variable**, I moved the LED's control side from the always-on 5V rail to a **GPIO pin** on the Arduino. I connected it to **pin 3**.

### The theory behind it

Why pin 3 specifically?

> For brightness control you need a **PWM** pin. PWM (Pulse-Width Modulation) rapidly switches the pin on and off; the *fraction* of time it's on (the "duty cycle") sets the average brightness. In code you set this with `analogWrite(pin, 0–255)`.
>
> Not every pin can do PWM. On the Arduino Uno, the PWM-capable pins are **3, 5, 6, 9, 10, and 11**, marked on the board with a little **`~`** next to the number. Pin 3 is one of them, so it works.
>
> Tip: whenever you're not sure what a pin can do, google **"[your board name] pinout"** and check the official diagram.

What's a GPIO pin?

> GPIO stands for **General Purpose Input/Output**. These are the programmable pins you can set as inputs (to read a button or sensor) or outputs (to drive an LED or buzzer). Driving the LED from a GPIO instead of the raw 5V rail is what lets your *code* decide how bright it is.

---

## Adding the Potentiometer

To actually set the brightness by hand, I added a **potentiometer** (the knob).

To figure out how to wire it, I googled `potentiometer 3 pin datasheet breakout`, since a datasheet is the manufacturer's spec document for a part and it's where you'll find the official pinout.

A potentiometer has **3 pins**: the two outer pins are the ends of a resistive track (power and ground), and the **middle pin is the wiper**, the one whose voltage changes as you turn the knob.

I wired it up:

- **Power pin → 5V**
- **GND pin → ground**
- **Wiper (SIG) → A0**

![potentiometer wired to A0](https://cdn.hackclub.com/019f43ae-4688-7d2d-b852-33d82698b633/paste-1783546919648.png)

### The theory behind it

Why power the pot from 5V?

> Connect the pot to whatever voltage matches the input that's *reading* the wiper, that's the deciding factor, not the pot itself.
>
> The wiper goes to **A0**, an analog input, and the Arduino Uno is a 5V board (ATmega328P) whose analog inputs expect **0–5V**. Powering the pot from 5V gives the wiper the full 0–5V swing, which gives you the **best resolution** across the whole range of the knob.

Why does SIG go to A0?

> **A0 is an analog input.** As you turn the knob, the wiper voltage smoothly changes between 0V and 5V, and `analogRead(A0)` turns that into a number from **0 to 1023**. A plain digital pin can only tell you HIGH or LOW, but you want the *in-between* values to set brightness, so it has to be an analog pin like A0.
>
> The plan in firmware: read the knob on A0, scale it to 0–255, and `analogWrite()` that to the LED on pin 3.

---

## Adding the Button

Finally, I added a **button** to turn the LED on and off.

I used a **tactile push button** in an **active-low** layout: one side goes to **digital pin 2**, and the other side goes to **GND**. When you press the button, the two sides **bridge**, which connects pin 2 straight to ground so the Arduino can sense the press.

![button wired](https://cdn.hackclub.com/019f43b0-c8a4-70fd-ad80-ff6cdd99fc70/image.png)

### The theory behind it

Wait, what's actually happening when they "bridge"?

A tactile push button has four legs, but they aren't four separate connections. They come as two pairs, and each pair is permanently shorted together inside the button. Pins 1 and 2 are one side (Side A), and pins 3 and 4 are the other (Side B).

![Physical pin diagram](https://cdn.hackclub.com/019d64f2-0ab2-7a97-a6a2-c0e4637bd711/image.png)

![Internal schematic](https://cdn.hackclub.com/019d64f2-5c5b-7c82-8d01-eba0fbff8d62/image.png)

| Button pins | Physical side |
|:---:|:---:|
| 1, 2 | Side A (shorted) |
| 3, 4 | Side B (shorted) |

The switch connects Side A to Side B when pressed. In this circuit pin 2 sits on one side and GND on the other, so pressing bridges them and pulls pin 2 down to ground. That's the signal the Arduino reads as a press.

Watch out: make sure pin 2 and GND land on opposite sides of the button. If they're on the same internally-shorted pair, the button will look wired but do nothing, since that side is permanently connected to itself.

What does "active-low" mean?

> "Active-low" means the pin reads as **pressed when the signal goes LOW** (0V / GND). With the Arduino's **internal pull-up** enabled (`pinMode(2, INPUT_PULLUP)` in code), the pin sits **HIGH (5V)** while the button is idle, and drops to **LOW** the moment you press it and connect it to ground.
>
> It's the most common button wiring because it's dead simple: just the button and a ground wire, no extra resistor needed.

Does the button need a PWM pin too?

> Nope! A button is only ever **on or off**, so any regular **digital** pin works, no PWM required. That's why pin 2 (a plain digital pin) is fine here, even though it isn't one of the `~` PWM pins. Save the PWM pins for things that actually need smooth control, like the LED.

> **The button is momentary**, it only closes the circuit while you're holding it. Turning that press into an on/off *toggle* (press once = on, press again = off) is something your code handles, not the wiring.

---

## Writing the Firmware

The wiring is done, but right now the board doesn't actually do anything yet. Time to bring it to life with code!

Here's what we want the code to do:

- Read the knob and set the LED's brightness from it
- Watch the button and toggle the LED on/off with each press
- Keep the brightness setting, so switching back on returns to the same level

### Naming the pins

First, give the pins friendly names so the rest of the code reads clearly:

```cpp
const int LED_PIN = 3;      // PWM pin (~) for brightness
const int BUTTON_PIN = 2;   // button to GND, uses internal pull-up
const int POT_PIN = A0;     // potentiometer wiper
```

These line up exactly with how we wired everything: LED on PWM pin **3**, button on **2**, pot wiper on **A0**. `const int` just means "a whole number that never changes," so if you ever move a wire, you fix the number here once instead of hunting through the whole sketch.

### Tracking the state

The pins are named, but the sketch also needs to *remember* a few things between passes. Since `loop()` runs thousands of times a second and forgets its local variables each time around, anything that has to survive from one loop to the next lives **outside** `loop()` as a global:

```cpp
bool ledOn = false;             // current on/off state
int lastButtonReading = HIGH;   // last raw reading (HIGH = not pressed with pull-up)
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;
```

- `ledOn` is the LED's on/off state. The button flips it, and the brightness code reads it to decide whether to light up.
- `lastButtonReading` holds what the button pin read on the *previous* loop, so we can catch the exact moment it changes instead of reacting the whole time it's held.
- `lastDebounceTime` records **when** the reading last changed. That timestamp is what lets us measure how long it's held steady.
- `debounceDelay` is how long, in milliseconds, the reading has to stay put before we trust it. 50 ms is plenty for a button.

`ledOn` starts `false` so the LED begins switched off, and `lastButtonReading` starts `HIGH` because that's how an idle, pulled-up button reads. If the debounce ones don't fully click yet, that's fine, they only matter once we get to reading the button, and we'll walk through exactly how they're used there.

### setup(): configure the pins once

```cpp
void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // no external resistor needed
}
```

What are setup() and loop()?

> Every Arduino sketch has two blocks. **`setup()`** runs **once**, the moment the board powers on, it's where you configure things. **`loop()`** then runs **over and over forever**, thousands of times a second, and that's where the actual behavior lives.

Here `setup()` tells the board the LED pin is an **OUTPUT** (we're driving it) and the button pin is an **INPUT_PULLUP**. Remember the active-low wiring from earlier? `INPUT_PULLUP` is the code half of that: it switches on the Arduino's **internal pull-up resistor** so the pin sits **HIGH** on its own and only drops **LOW** when you press the button to ground. That's exactly why we didn't need an external resistor on the button.

### Reading the knob to set brightness

Inside `loop()`, we read the pot and turn it into a brightness value:

```cpp
int potValue = analogRead(POT_PIN);          // 0..1023
int brightness = map(potValue, 0, 1023, 0, 255);
analogWrite(LED_PIN, brightness);
```

This is the plan we set up back in the wiring. `analogRead(A0)` gives a number from **0 to 1023** depending on where the knob sits. But `analogWrite()` (PWM) only accepts **0 to 255**. So we translate between the two ranges.

What does map() do?

> `map(value, fromLow, fromHigh, toLow, toHigh)` rescales a number from one range into another. Here it takes the knob's **0–1023** and squashes it proportionally into **0–255**: knob all the way down → 0 (off), all the way up → 255 (full brightness), halfway → about 127. It saves you doing the division by hand.

### Reading the button to toggle the LED

We want each press to flip the LED between on and off. That sounds simple, but two things make it tricky. The first is spotting the moment a fresh press happens instead of reacting the whole time the button is held down. The second is debouncing.

```cpp
int reading = digitalRead(BUTTON_PIN);

if (reading != lastButtonReading) {
  lastDebounceTime = millis();   // input changed, reset timer
}

if ((millis() - lastDebounceTime) > debounceDelay) {
  static int buttonState = HIGH;
  if (reading != buttonState) {
    buttonState = reading;
    if (buttonState == LOW) {   // a press pulls the pin LOW
      ledOn = !ledOn;           // toggle on each press
    }
  }
}
lastButtonReading = reading;
```

What is debounce, and why do I need it?

> When you press a physical button, the metal contacts don't connect cleanly, they **bounce**, flickering between connected and disconnected for a few milliseconds. The Arduino is fast enough to see every one of those flickers as a separate press, so a single push could toggle the LED several times and leave it in a random state.
>
> **Debouncing** fixes this: after any change on the pin, we wait a short, stable period (`debounceDelay`, 50 ms here) before believing it. `millis()` returns the time since the board booted, so `millis() - lastDebounceTime` measures how long the reading has held steady. Only once it's been stable long enough do we act on it.

The other trick is **only reacting to the change**. `buttonState` remembers what the button was last time, and we flip `ledOn` only when it actually changes from not-pressed to **LOW** (pressed). Without that check, the LED would toggle continuously the entire time you held the button down.

`ledOn = !ledOn` is the toggle itself: `!` means "not," so it flips `true` ↔ `false` on every press.

Finally, we use that on/off state to either show the knob's brightness or turn the LED fully off:

```cpp
if (ledOn) {
  int potValue = analogRead(POT_PIN);
  int brightness = map(potValue, 0, 1023, 0, 255);
  analogWrite(LED_PIN, brightness);
} else {
  analogWrite(LED_PIN, 0);   // off
}
```

Because the brightness is read fresh from the knob on every loop, switching the LED back on instantly picks up wherever the knob is now, that's the "remembers your setting" behavior: the knob position *is* the memory.

### The full sketch

Put it all together and you get:

```cpp
const int LED_PIN = 3;      // PWM pin (~) for brightness
const int BUTTON_PIN = 2;   // button to GND, uses internal pull-up
const int POT_PIN = A0;     // potentiometer wiper

bool ledOn = false;             // current on/off state
int lastButtonReading = HIGH;   // last raw reading (HIGH = not pressed with pull-up)
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // no external resistor needed
}

void loop() {
  // --- Read button with debounce ---
  int reading = digitalRead(BUTTON_PIN);

  if (reading != lastButtonReading) {
    lastDebounceTime = millis();   // input changed, reset timer
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    // reading has been stable long enough
    static int buttonState = HIGH;
    if (reading != buttonState) {
      buttonState = reading;
      // with INPUT_PULLUP, a press pulls the pin LOW
      if (buttonState == LOW) {
        ledOn = !ledOn;   // toggle on each press
      }
    }
  }
  lastButtonReading = reading;

  // --- Set brightness from potentiometer ---
  if (ledOn) {
    int potValue = analogRead(POT_PIN);          // 0..1023
    int brightness = map(potValue, 0, 1023, 0, 255);
    analogWrite(LED_PIN, brightness);
  } else {
    analogWrite(LED_PIN, 0);                      // off
  }
}
```


## What's Next

Nice work, you just built a real project from scratch, wired up and running firmware you wrote yourself.

**Better yet, the time you spent counts toward bread you can spend in the shop!** Keep building to make your project [submittable](https://breadboard.hackclub.com/requirements), and you'll earn a full breadboard kit plus other cool stuff to redeem. The more you work on your project, the more stuff you can get!

From here it's yours to shape into something cooler and more you. When you want to go deeper, the [guides and resources](https://breadboard.hackclub.com/get-started) cover breadboard basics, [writing firmware](https://breadboard.hackclub.com/guides/firmware), and plenty more to learn from. And you're never building alone, so whenever you get stuck just ask in [#breadboard](https://hackclub.enterprise.slack.com/archives/C09EB0AE68M). Now go make something you're proud of!
